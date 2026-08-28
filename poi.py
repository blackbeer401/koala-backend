import pandas as pd


def load_poi_candidates():

    df = pd.read_csv("data/poi121_coordinates.csv")

    candidates = df[
        ["AREA_CD", "AREA_NM", "CATEGORY", "longitude", "latitude"]
    ].to_dict(orient="records")

    return candidates