import geopandas as gpd


file_path = "data/poi121_polygon/서울시 주요 121장소 영역.shp"

gdf = gpd.read_file(file_path)

print(gdf.head())
print()
print("행 개수:", len(gdf))
print("컬럼:", gdf.columns.tolist())
print("좌표계:", gdf.crs)

gdf_projected = gdf.to_crs(epsg=5179)

centroids = gdf_projected.geometry.centroid

centroids_wgs84 = gpd.GeoSeries(
    centroids,
    crs="EPSG:5179"
).to_crs(epsg=4326)

gdf["longitude"] = centroids_wgs84.x
gdf["latitude"] = centroids_wgs84.y

print()
print(
    gdf[
        ["AREA_CD", "AREA_NM", "longitude", "latitude"]
    ].head()
)


poi_coordinates = gdf[
    ["AREA_CD", "AREA_NM", "CATEGORY", "longitude", "latitude"]
]

poi_coordinates.to_csv(
    "data/poi121_coordinates.csv",
    index=False,
    encoding="utf-8-sig"
)

print()
print("poi121_coordinates.csv 저장 완료")