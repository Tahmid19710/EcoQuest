import json
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform

SOURCE = Path(
    r"D:\EcoQuest\ml_backend\data\maps\EcoQuest_Upazila_Susceptibility.geojson"
)

OUTPUT = Path(
    r"D:\EcoQuest\ml_backend\data\maps\EcoQuest_Upazila_Susceptibility_simplified.geojson"
)

TOLERANCE_METRES = 45.0

print("=" * 65)
print("ECOQUEST GEOJSON SIMPLIFICATION")
print("=" * 65)

if not SOURCE.exists():
    raise FileNotFoundError(SOURCE)

original_size = SOURCE.stat().st_size

print("Original size:", round(original_size / 1024 / 1024, 2), "MB")

with SOURCE.open("r", encoding="utf-8") as f:
    data = json.load(f)

if data.get("type") != "FeatureCollection":
    raise ValueError("Invalid GeoJSON FeatureCollection")

to_utm = Transformer.from_crs(
    "EPSG:4326", "EPSG:32646", always_xy=True
).transform

to_wgs84 = Transformer.from_crs(
    "EPSG:32646", "EPSG:4326", always_xy=True
).transform

features = data["features"]

print("Original features:", len(features))

for index, feature in enumerate(features, start=1):

    original_geometry = shape(feature["geometry"])

    if not original_geometry.is_valid:
        raise ValueError(
            f"Invalid original geometry: {index}"
        )

    projected = transform(to_utm, original_geometry)

    simplified = projected.simplify(
        TOLERANCE_METRES,
        preserve_topology=True
    )

    if simplified.is_empty or not simplified.is_valid:
        raise ValueError(
            f"Invalid simplified geometry: {index}"
        )

    geographic = transform(to_wgs84, simplified)

    feature["geometry"] = mapping(geographic)

    print(
        f"Processed {index}/{len(features)}:",
        feature["properties"].get("upazila", "Unknown")
    )

data.pop("bbox", None)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)

with OUTPUT.open("w", encoding="utf-8") as f:
    json.dump(
        data,
        f,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False
    )

new_size = OUTPUT.stat().st_size

reduction = (
    (original_size - new_size) / original_size
) * 100

print("\n" + "=" * 65)
print("SIMPLIFICATION COMPLETED")
print("=" * 65)

print("Features:", len(features))
print("Tolerance:", TOLERANCE_METRES, "metres")
print("Original:", round(original_size / 1024 / 1024, 2), "MB")
print("Simplified:", round(new_size / 1024 / 1024, 2), "MB")
print("Size reduction:", round(reduction, 2), "%")
print("Output:", OUTPUT)
print("=" * 65)
