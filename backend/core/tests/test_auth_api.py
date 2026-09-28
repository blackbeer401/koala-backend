import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from auth import JWT_ALGORITHM, JWT_SECRET_KEY, hash_password, verify_password
from database import get_db
from db_models import AccountRecoveryCode, User
from main import app
from auth_routes import _code_digest


class AuthApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.valid_password_hash = hash_password("correct-password")

    def setUp(self):
        self.db = Mock()
        app.dependency_overrides[get_db] = lambda: self.db

    def tearDown(self):
        app.dependency_overrides.clear()

    def make_user(self, user_id=1, email="user@example.com"):
        return User(
            id=user_id,
            email=email,
            password_hash=self.valid_password_hash,
            nickname="테스트",
            created_at=datetime(2026, 9, 4, tzinfo=timezone.utc),
        )

    def auth_header(self, token):
        return {"Authorization": f"Bearer {token}"}

    def encode_token(self, payload):
        return jwt.encode(
            payload,
            JWT_SECRET_KEY,
            algorithm=JWT_ALGORITHM,
        )

    @patch("database.SessionLocal")
    def test_get_db_closes_session(self, mock_session_local):
        session = mock_session_local.return_value
        dependency = get_db()

        self.assertIs(next(dependency), session)
        dependency.close()

        session.close.assert_called_once()

    @patch("auth_routes._consume_code")
    def test_signup_normalizes_input_and_hashes_password(self, consume_code):
        self.db.scalar.return_value = None
        consume_code.return_value.user_id = None

        def assign_generated_values(user):
            user.id = 1
            user.created_at = datetime(2026, 9, 4, tzinfo=timezone.utc)

        self.db.add.side_effect = assign_generated_values
        response = self.client.post(
            "/auth/signup",
            json={
                "email": "  User@Example.COM  ",
                "password": "password123!",
                "nickname": "  코알라  ",
                "email_verification_code": "123456",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json(),
            {
                "id": 1,
                "email": "user@example.com",
                "recovery_email_masked": None,
                "nickname": "코알라",
                "created_at": "2026-09-04T00:00:00Z",
            },
        )
        saved_user = self.db.add.call_args.args[0]
        self.assertNotEqual(saved_user.password_hash, "password123")
        self.assertTrue(verify_password("password123!", saved_user.password_hash))
        self.assertIsNone(saved_user.recovery_email)
        self.assertNotIn("password_hash", response.json())

    @patch("auth_routes.email_delivery_ready", return_value=True)
    @patch("auth_routes._issue_code")
    def test_signup_email_code_is_sent_to_login_email(self, issue_code, _ready):
        self.db.scalar.return_value = None

        response = self.client.post(
            "/auth/signup/email-code",
            json={"email": " USER@EXAMPLE.COM "},
        )

        self.assertEqual(response.status_code, 202)
        issue_code.assert_called_once()
        self.assertEqual(issue_code.call_args.kwargs["email"], "user@example.com")
        self.assertEqual(issue_code.call_args.kwargs["purpose"], "signup_email")

    def test_signup_rejects_duplicate_email(self):
        self.db.scalar.return_value = self.make_user()

        response = self.client.post(
            "/auth/signup",
            json={
                "email": " USER@EXAMPLE.COM ",
                "password": "password123!",
                "nickname": "코알라",
                "email_verification_code": "123456",
            },
        )

        self.assertEqual(response.status_code, 409)
        statement = self.db.scalar.call_args.args[0]
        self.assertIn("user@example.com", statement.compile().params.values())
        self.db.add.assert_not_called()

    @patch("auth_routes._consume_code")
    def test_signup_rolls_back_unique_race(self, consume_code):
        self.db.scalar.return_value = None
        consume_code.return_value.user_id = None
        self.db.commit.side_effect = IntegrityError(
            "duplicate",
            {},
            Exception("duplicate"),
        )

        response = self.client.post(
            "/auth/signup",
            json={
                "email": "user@example.com",
                "password": "password123!",
                "nickname": "코알라",
                "email_verification_code": "123456",
            },
        )

        self.assertEqual(response.status_code, 409)
        self.db.rollback.assert_called_once()

    def test_signup_rejects_invalid_input(self):
        invalid_payloads = [
            {"email": "invalid", "password": "password123", "nickname": "n"},
            {"email": "a@b.com", "password": "short", "nickname": "n"},
            {"email": "a@b.com", "password": "password123", "nickname": "   "},
            {
                "email": "a@b.com",
                "password": "password123",
                "nickname": "n" * 51,
            },
            {
                "email": "a@b.com",
                "password": "englishOnly123",
                "nickname": "n",
                "email_verification_code": "123456",
            },
            {
                "email": "a@b.com",
                "password": "특수문자만!!",
                "nickname": "n",
                "email_verification_code": "123456",
            },
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post("/auth/signup", json=payload)
                self.assertEqual(response.status_code, 422)

    def test_login_success(self):
        self.db.scalar.return_value = self.make_user()

        response = self.client.post(
            "/auth/login",
            json={
                "email": " USER@EXAMPLE.COM ",
                "password": "correct-password",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["token_type"], "bearer")
        self.assertIsInstance(response.json()["access_token"], str)
        statement = self.db.scalar.call_args.args[0]
        self.assertIn("user@example.com", statement.compile().params.values())

    @patch("auth_routes.email_delivery_ready", return_value=True)
    @patch("auth_routes._issue_code")
    def test_username_recovery_request_uses_verified_recovery_email(self, issue_code, _ready):
        user = self.make_user()
        user.recovery_email = "backup@example.com"
        self.db.scalar.return_value = user

        response = self.client.post(
            "/auth/recovery/username",
            json={"email": " BACKUP@EXAMPLE.COM "},
        )

        self.assertEqual(response.status_code, 202)
        issue_code.assert_called_once()
        self.assertEqual(issue_code.call_args.kwargs["email"], "backup@example.com")
        self.assertEqual(issue_code.call_args.kwargs["purpose"], "username_lookup")

    @patch("auth_routes.email_delivery_ready", return_value=True)
    def test_password_reset_changes_password_and_revokes_old_access_token(self, _ready):
        user = self.make_user()
        user.token_version = 0
        old_token = ""  # Filled by the existing login route below.
        self.db.scalar.return_value = user
        login_response = self.client.post(
            "/auth/login",
            json={"email": user.email, "password": "correct-password"},
        )
        old_token = login_response.json()["access_token"]
        code = "083214"
        recovery_row = AccountRecoveryCode(
            user_id=user.id,
            purpose="password_reset",
            target_email=user.email,
            code_hash=_code_digest("password_reset", user.email, code),
            attempts=0,
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10),
        )
        self.db.scalars.return_value.all.return_value = [recovery_row]
        self.db.get.return_value = user

        response = self.client.post(
            "/auth/recovery/password/verify",
            json={"email": user.email, "code": code, "new_password": "brand-new-password"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(verify_password("brand-new-password", user.password_hash))
        self.assertEqual(user.token_version, 1)
        stale_session = self.client.get("/users/me", headers=self.auth_header(old_token))
        self.assertEqual(stale_session.status_code, 401)

    def test_username_recovery_masks_login_email(self):
        email = "backup@example.com"
        user = self.make_user(email="koala.user@example.com")
        recovery_row = AccountRecoveryCode(
            user_id=user.id,
            purpose="username_lookup",
            target_email=email,
            code_hash=_code_digest("username_lookup", email, "234567"),
            attempts=0,
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10),
        )
        self.db.scalars.return_value.all.return_value = [recovery_row]
        self.db.get.return_value = user

        response = self.client.post(
            "/auth/recovery/username/verify",
            json={"email": email, "code": "234567"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["login_email"], "k******@example.com")
        self.assertIsNotNone(recovery_row.consumed_at)

    def test_recovery_code_cannot_be_reused(self):
        self.db.scalars.return_value.all.return_value = []
        response = self.client.post(
            "/auth/recovery/username/verify",
            json={"email": "backup@example.com", "code": "000000"},
        )

        self.assertEqual(response.status_code, 400)

    def test_login_failures_do_not_reveal_account_existence(self):
        self.db.scalar.return_value = self.make_user()
        wrong_password = self.client.post(
            "/auth/login",
            json={"email": "user@example.com", "password": "wrong-password"},
        )
        self.db.scalar.return_value = None
        missing_user = self.client.post(
            "/auth/login",
            json={"email": "missing@example.com", "password": "wrong-password"},
        )

        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(missing_user.status_code, 401)
        self.assertEqual(wrong_password.json(), missing_user.json())
        self.assertEqual(
            wrong_password.headers["www-authenticate"],
            "Bearer",
        )

    def test_users_me_with_valid_token(self):
        user = self.make_user()
        self.db.get.return_value = user
        self.db.scalar.return_value = user
        login_response = self.client.post(
            "/auth/login",
            json={"email": user.email, "password": "correct-password"},
        )

        response = self.client.get(
            "/users/me",
            headers=self.auth_header(login_response.json()["access_token"]),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["email"], user.email)
        self.assertNotIn("password_hash", response.json())

    def test_users_me_without_token(self):
        response = self.client.get("/users/me")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def test_users_me_rejects_invalid_token(self):
        response = self.client.get(
            "/users/me",
            headers=self.auth_header("not-a-token"),
        )

        self.assertEqual(response.status_code, 401)

    def test_users_me_rejects_expired_token(self):
        token = self.encode_token({
            "sub": "1",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        })

        response = self.client.get("/users/me", headers=self.auth_header(token))

        self.assertEqual(response.status_code, 401)

    def test_users_me_rejects_missing_sub(self):
        token = self.encode_token({
            "exp": datetime.now(timezone.utc) + timedelta(minutes=1),
        })

        response = self.client.get("/users/me", headers=self.auth_header(token))

        self.assertEqual(response.status_code, 401)

    def test_users_me_rejects_missing_exp(self):
        token = self.encode_token({"sub": "1"})

        response = self.client.get("/users/me", headers=self.auth_header(token))

        self.assertEqual(response.status_code, 401)

    def test_users_me_rejects_invalid_sub(self):
        token = self.encode_token({
            "sub": "not-an-id",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=1),
        })

        response = self.client.get("/users/me", headers=self.auth_header(token))

        self.assertEqual(response.status_code, 401)

    def test_users_me_rejects_deleted_user(self):
        self.db.get.return_value = None
        token = self.encode_token({
            "sub": "999",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=1),
        })

        response = self.client.get("/users/me", headers=self.auth_header(token))

        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
