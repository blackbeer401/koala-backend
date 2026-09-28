import hmac
import logging
import os
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import create_access_token, decode_access_token_claims, hash_password, verify_password
from database import get_db
from db_models import AccountRecoveryCode, User
from models import (
    AccessTokenResponse,
    LoginRequest,
    PasswordResetVerifyRequest,
    RecoveryEmailRequest,
    SignupRequest,
    UserResponse,
    UsernameRecoveryVerifyRequest,
)

load_dotenv()


router = APIRouter()
logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)
CODE_LIFETIME = timedelta(minutes=10)
CODE_RESEND_WAIT = timedelta(seconds=60)
CODE_IP_HOURLY_LIMIT = 8
CODE_MAX_ATTEMPTS = 5


def email_delivery_ready() -> bool:
    """Require complete SMTP credentials and an encrypted transport before enabling email."""
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    use_ssl = os.getenv("SMTP_USE_SSL", "false").strip().lower() == "true"
    starttls = os.getenv("SMTP_STARTTLS", "true").strip().lower() == "true"
    local_host = host.lower() in {"localhost", "127.0.0.1", "::1"}
    return bool(host and sender and username and password and (use_ssl or starttls or local_host))


def send_recovery_email(destination: str, purpose: str, code: str) -> None:
    host = os.getenv("SMTP_HOST")
    sender = os.getenv("SMTP_FROM_EMAIL")
    if not host or not sender:
        raise RuntimeError("SMTP email delivery is not configured")

    messages = {
        "signup_email": ("코알라 이메일 인증", "회원가입 이메일 인증 코드"),
        "username_lookup": ("코알라 로그인 이메일 확인", "로그인 이메일 확인 코드"),
        "password_reset": ("코알라 비밀번호 재설정", "비밀번호 재설정 인증 코드"),
    }
    subject, description = messages[purpose]
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = destination
    message.set_content(
        f"{description}는 {code} 입니다.\n\n"
        "이 코드는 10분 동안 유효하며 한 번만 사용할 수 있습니다. "
        "요청하지 않았다면 이 메일을 무시해 주세요."
    )

    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    use_ssl = os.getenv("SMTP_USE_SSL", "false").strip().lower() == "true"
    starttls = os.getenv("SMTP_STARTTLS", "true").strip().lower() == "true"
    if not use_ssl and not starttls and host.lower() not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("SMTP authentication must use TLS")
    try:
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context()) as client:
                if username and password:
                    client.login(username, password)
                refused = client.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=15) as client:
                client.ehlo()
                if starttls:
                    client.starttls(context=ssl.create_default_context())
                    client.ehlo()
                if username and password:
                    client.login(username, password)
                refused = client.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        logger.exception("Recovery email SMTP transaction failed (purpose=%s)", purpose)
        raise RuntimeError("SMTP delivery transaction failed") from error

    if refused or destination.lower() in {address.lower() for address in refused}:
        logger.error("SMTP server rejected a recovery email recipient (purpose=%s)", purpose)
        raise RuntimeError("SMTP server rejected the recipient")

    logger.info("SMTP server accepted recovery email (purpose=%s)", purpose)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _code_digest(purpose: str, email: str, code: str) -> str:
    from auth import JWT_SECRET_KEY

    payload = f"{purpose}:{email}:{code}".encode("utf-8")
    return hmac.new(JWT_SECRET_KEY.encode("utf-8"), payload, "sha256").hexdigest()


def _require_email_delivery() -> None:
    if not email_delivery_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="이메일 발송 설정이 아직 완료되지 않았습니다.",
        )


def _issue_code(
    db: Session,
    request: Request,
    *,
    email: str,
    purpose: str,
    user_id: int | None,
    send_email: bool = True,
) -> None:
    now = _utc_now()
    # Expiry is set by the application in UTC. Use it for cleanup and limits so
    # database server timezone settings cannot extend or shorten resend delays.
    db.execute(delete(AccountRecoveryCode).where(AccountRecoveryCode.expires_at < now - timedelta(days=1)))
    client_ip = request.client.host if request.client else None
    recent_for_address = db.scalar(
        select(AccountRecoveryCode.id)
        .where(
            AccountRecoveryCode.target_email == email,
            AccountRecoveryCode.purpose == purpose,
            AccountRecoveryCode.expires_at >= now - CODE_RESEND_WAIT + CODE_LIFETIME,
        )
        .limit(1)
    )
    if recent_for_address:
        raise HTTPException(status_code=429, detail="인증 코드를 다시 보내기 전에 잠시 기다려 주세요.")

    if client_ip:
        recent_from_ip = db.scalar(
            select(func.count(AccountRecoveryCode.id)).where(
                AccountRecoveryCode.request_ip == client_ip,
                AccountRecoveryCode.expires_at >= now - timedelta(hours=1) + CODE_LIFETIME,
            )
        ) or 0
        if recent_from_ip >= CODE_IP_HOURLY_LIMIT:
            raise HTTPException(status_code=429, detail="요청이 많아요. 잠시 후 다시 시도해 주세요.")

    previous_codes = db.scalars(
        select(AccountRecoveryCode).where(
            AccountRecoveryCode.target_email == email,
            AccountRecoveryCode.purpose == purpose,
            AccountRecoveryCode.consumed_at.is_(None),
        )
    ).all()
    for previous_code in previous_codes:
        previous_code.consumed_at = now

    code = f"{secrets.randbelow(1_000_000):06d}"
    row = AccountRecoveryCode(
        user_id=user_id,
        purpose=purpose,
        target_email=email,
        code_hash=_code_digest(purpose, email, code),
        request_ip=client_ip,
        expires_at=now + CODE_LIFETIME,
        created_at=now,
    )
    db.add(row)
    db.commit()
    try:
        if send_email:
            send_recovery_email(email, purpose, code)
    except Exception as error:
        db.delete(row)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
        ) from error


def _consume_code(db: Session, *, email: str, purpose: str, code: str) -> AccountRecoveryCode:
    rows = db.scalars(
        select(AccountRecoveryCode)
        .where(
            AccountRecoveryCode.target_email == email,
            AccountRecoveryCode.purpose == purpose,
            AccountRecoveryCode.consumed_at.is_(None),
            AccountRecoveryCode.expires_at > _utc_now(),
            AccountRecoveryCode.attempts < CODE_MAX_ATTEMPTS,
        )
        .order_by(AccountRecoveryCode.expires_at.desc())
        .limit(5)
    ).all()
    digest = _code_digest(purpose, email, code)
    for row in rows:
        if hmac.compare_digest(row.code_hash, digest):
            row.consumed_at = _utc_now()
            db.commit()
            return row
    for row in rows[:1]:
        row.attempts += 1
    db.commit()
    raise HTTPException(status_code=400, detail="인증 코드가 올바르지 않거나 만료되었습니다.")


def _masked_email(email: str) -> str:
    local, separator, domain = email.partition("@")
    if not separator:
        return ""
    visible = local[:1]
    return f"{visible}{'*' * max(2, min(6, len(local) - 1))}@{domain}"


def _authenticated_account(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Resolve the shared dependency at request time, after this module is loaded.
    return get_current_user(credentials, db)


@router.get("/auth/recovery/status")
def recovery_status():
    return {"email_enabled": email_delivery_ready()}


@router.post("/auth/signup/email-code", status_code=status.HTTP_202_ACCEPTED)
def send_signup_email_code(
    request: RecoveryEmailRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    _require_email_delivery()
    email = request.email
    already_used = db.scalar(select(User.id).where(User.email == email).limit(1))
    if already_used:
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다. 로그인해 주세요.")
    _issue_code(db, http_request, email=email, purpose="signup_email", user_id=None)
    return {"message": "메일 발송 서버가 인증 메일을 접수했습니다. 받은편지함과 스팸함을 확인해 주세요. 인증 코드는 10분간 유효합니다."}


@router.post("/auth/recovery/username", status_code=status.HTTP_202_ACCEPTED)
def request_username_recovery(
    request: RecoveryEmailRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    _require_email_delivery()
    user = db.scalar(select(User).where(User.recovery_email == request.email))
    _issue_code(
        db,
        http_request,
        email=request.email,
        purpose="username_lookup",
        user_id=user.id if user else None,
        send_email=bool(user),
    )
    return {"message": "가입된 정보와 일치하면 인증 코드를 보냈습니다."}


@router.post("/auth/recovery/username/verify")
def verify_username_recovery(
    request: UsernameRecoveryVerifyRequest,
    db: Session = Depends(get_db),
):
    row = _consume_code(
        db,
        email=request.email,
        purpose="username_lookup",
        code=request.code,
    )
    user = db.get(User, row.user_id) if row.user_id else None
    if not user:
        raise HTTPException(status_code=400, detail="계정 정보를 확인할 수 없습니다.")
    return {"login_email": _masked_email(user.email)}


@router.post("/auth/recovery/password", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    request: RecoveryEmailRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    _require_email_delivery()
    user = db.scalar(select(User).where(User.email == request.email))
    _issue_code(
        db,
        http_request,
        email=request.email,
        purpose="password_reset",
        user_id=user.id if user else None,
        send_email=bool(user),
    )
    return {"message": "계정이 있다면 비밀번호 재설정 코드를 이메일로 보냈습니다."}


@router.post("/auth/recovery/password/verify")
def complete_password_reset(
    request: PasswordResetVerifyRequest,
    db: Session = Depends(get_db),
):
    code = _consume_code(
        db,
        email=request.email,
        purpose="password_reset",
        code=request.code,
    )
    user = db.get(User, code.user_id) if code.user_id else None
    if not user or user.email != request.email:
        raise HTTPException(status_code=400, detail="인증 코드가 올바르지 않거나 만료되었습니다.")
    user.password_hash = hash_password(request.new_password)
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    return {"message": "비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요."}


@router.post("/users/me/recovery-email/request", status_code=status.HTTP_202_ACCEPTED)
def request_recovery_email_update(
    request: RecoveryEmailRequest,
    http_request: Request,
    user: User = Depends(_authenticated_account),
    db: Session = Depends(get_db),
):
    _require_email_delivery()
    if request.email == user.email:
        raise HTTPException(status_code=422, detail="복구 이메일은 로그인 이메일과 달라야 합니다.")
    already_used = db.scalar(
        select(User.id).where(
            User.id != user.id,
            or_(User.email == request.email, User.recovery_email == request.email),
        ).limit(1)
    )
    if already_used:
        raise HTTPException(status_code=409, detail="이미 다른 계정에서 사용 중인 이메일입니다.")
    _issue_code(
        db,
        http_request,
        email=request.email,
        purpose="recovery_email_update",
        user_id=user.id,
    )
    return {"message": "복구 이메일 인증 코드를 보냈습니다."}


@router.post("/users/me/recovery-email/verify")
def verify_recovery_email_update(
    request: UsernameRecoveryVerifyRequest,
    user: User = Depends(_authenticated_account),
    db: Session = Depends(get_db),
):
    code = _consume_code(
        db,
        email=request.email,
        purpose="recovery_email_update",
        code=request.code,
    )
    if code.user_id != user.id:
        raise HTTPException(status_code=400, detail="인증 코드가 올바르지 않거나 만료되었습니다.")
    user.recovery_email = request.email
    db.commit()
    return {"recovery_email": _masked_email(request.email)}


# 인증 실패 응답 형식을 한곳에서 통일한다.
def unauthorized_error():
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증에 실패했습니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )


# 보호된 API에서 Bearer 토큰을 검증하고 현재 사용자 객체를 반환한다.
def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise unauthorized_error()

    try:
        claims = decode_access_token_claims(credentials.credentials)
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise unauthorized_error()

    user = db.get(User, claims["sub"])
    if user is None or (user.token_version or 0) != claims["ver"]:
        raise unauthorized_error()

    return user


# 로그인 여부가 선택적인 API용 의존성이다. 토큰이 없으면 익명 사용자로 처리한다.
def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if credentials is None:
        return None

    try:
        claims = decode_access_token_claims(credentials.credentials)
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise unauthorized_error()

    user = db.get(User, claims["sub"])
    if user is None or (user.token_version or 0) != claims["ver"]:
        raise unauthorized_error()

    return user


@router.post(
    "/auth/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    # 가입 이메일 인증을 통과한 주소만 계정 아이디로 저장한다.
    existing_user = db.scalar(select(User).where(User.email == request.email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다.",
        )

    # 비밀번호 원문은 저장하지 않고 해시값만 사용자 레코드에 기록한다.
    verified_code = _consume_code(
        db,
        email=request.email,
        purpose="signup_email",
        code=request.email_verification_code,
    )
    if verified_code.user_id is not None:
        raise HTTPException(status_code=400, detail="이메일 인증을 다시 진행해 주세요.")

    user = User(
        email=request.email,
        recovery_email=None,
        password_hash=hash_password(request.password),
        nickname=request.nickname,
        token_version=0,
    )
    db.add(user)

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다.",
        ) from error

    db.refresh(user)
    return user


@router.post("/auth/login", response_model=AccessTokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    # 이메일과 비밀번호를 검증한 뒤 성공한 경우에만 access token을 발급한다.
    user = db.scalar(
        select(User).where(User.email == request.email)
    )
    if user is None or not verify_password(request.password, user.password_hash):
        raise unauthorized_error()

    return AccessTokenResponse(
        access_token=create_access_token(user.id, user.token_version or 0),
    )


@router.get("/users/me", response_model=UserResponse)
def read_current_user(user: User = Depends(get_current_user)):
    return user
