from flask import Flask, render_template, jsonify, send_file
import os
import re
import json 

from flask import request
import pandas as pd

import sys

sys.path.append("/backend/src/processing")

from cetesb.csv_reader import load_cetesb_data
from cetesb.stations import load_stations

from satellite.indexer import build_satellite_index
from satellite.timeseries import get_satellite_series
from satellite.raster_reader import get_satellite_mean

from cetesb_compare import compare_station

from config import create_sat_config

app = Flask(__name__)

#DATA_DIR = "/home/jurandir/cipc_output/geotiff"

# Retirar o comentário para DOCKER
DATA_DIR = "/data/geotiff"

# (mapeado) CETESB_JSON = "/home/jurandir/cipc_data/cetesb/lista_estacoes.json"
CETESB_JSON = "/data/cetesb/lista_estacoes.json"

# Dados CSV CETESB
CETESB_CSV = "/data/cetesb/media_diaria_csvs"

# ---------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------
@app.route("/api/produtos")
def produtos():

    if not os.path.exists(DATA_DIR):
        return jsonify([])

    produtos = [
        d for d in os.listdir(DATA_DIR)
        if os.path.isdir(os.path.join(DATA_DIR, d))
    ]

    return jsonify(sorted(produtos))


# ---------------------------------------------------
@app.route("/api/anos/<produto>")
def anos(produto):

    path = os.path.join(DATA_DIR, produto)

    anos = [
        d for d in os.listdir(path)
        if os.path.isdir(os.path.join(path, d))
    ]

    return jsonify(sorted(anos))


# ---------------------------------------------------
@app.route("/api/datas/<produto>/<ano>")
def datas(produto, ano):

    path = os.path.join(DATA_DIR, produto, ano)

    datas = []

    for f in os.listdir(path):

        if f.endswith(".tif"):

            # extrai data YYYYMMDD do nome
            m = re.search(r'(\d{8})', f)

            if m:
                datas.append(m.group(1))

    return jsonify(sorted(datas))


# ---------------------------------------------------
@app.route("/geotiff/<produto>/<ano>/<data>")
def geotiff(produto, ano, data):

    path = os.path.join(DATA_DIR, produto, ano)

    for f in os.listdir(path):

        if data in f and f.endswith(".tif"):

            return send_file(os.path.join(path, f))

    return {"erro": "arquivo não encontrado"}, 404


# ---------------------------------------------------
@app.route("/api/colormap/<product>")
def get_colormap(product):

    #with open("/home/jurandir/cipc_rad/config/colormaps.json") as f:
    with open("/config/colormaps.json") as f:
        try:
            data = json.load(f)
        except Exception as e:
            return {"error": str(e)}, 500
        #data = json.load(f)

    return jsonify(data[product])

# ---------------------------------------------------

@app.route("/api/datas_interval/<produto>/<start>/<end>")
def datas_interval(produto,start,end):

    pasta = os.path.join(DATA_DIR, produto)

    datas=set()

    for root,dirs,files in os.walk(pasta):

        for f in files:

            m=re.search(r"\d{8}",f)

            if m:

                d=m.group()

                if start <= d <= end:
                    datas.add(d)

    datas=sorted(list(datas))

    return jsonify(datas)
# ---------------------------------------------------

# API - Estações CETESB
@app.route("/api/cetesb/stations")
def cetesb_stations():

    with open(CETESB_JSON) as f:
        data = json.load(f)

    return jsonify(data)


@app.route("/api/compare_series")
def compare_series():

    try:

        codigo = request.args.get("station")

        linha_estacao = STATIONS_DF[
            STATIONS_DF["codigo"].astype(str) == str(codigo)
        ]

        if linha_estacao.empty:

            return jsonify({
                "erro": f"Estação {codigo} não encontrada"
            }), 200

        nome_estacao = linha_estacao.iloc[0]["nome"]

        lat_station = float(
            linha_estacao.iloc[0]["latitude"]
        )

        lon_station = float(
            linha_estacao.iloc[0]["longitude"]
        )

        print(f"Estação encontrada: {codigo}")
        print(f"Nome={nome_estacao}")
        print(f"Lat={lat_station} Lon={lon_station}")

        cetesb_gases = request.args.getlist(
            "cetesb"
        )

        sat_gases = request.args.getlist(
            "sat"
        )

        cetesb_gases = request.args.getlist("cetesb")
        sat_gases = request.args.getlist("sat")

        start = request.args.get("start")
        end = request.args.get("end")

        print("codigo=", codigo)
        print("cetesb=", cetesb_gases)
        print("sat=", sat_gases)

        data_inicio = pd.to_datetime(start)
        data_fim = pd.to_datetime(end)

        try:

            df = load_cetesb_data(
                input_dir=CETESB_CSV,
                estacoes=[codigo],
                poluentes=cetesb_gases,
                data_inicio=data_inicio,
                data_fim=data_fim
            )

        except Exception as e:

            return jsonify({
                "erro": str(e)
            }), 200

        if df is None or len(df) == 0:

            return jsonify({
                "erro": "Nenhum dado encontrado."
            }), 200

        print(df.columns.tolist())
        print(df.head())

        # -----------------------------
        # Normaliza datas
        # -----------------------------
        df["datetime"] = pd.to_datetime(df["datetime"])

        # -----------------------------
        # Descobre coluna de valor
        # -----------------------------
        valor_col = None

        for c in [
            "Valor Diário",
            "valor_diario",
            "value",
            "valor"
        ]:
            if c in df.columns:
                valor_col = c
                break

        if valor_col is None:

            return jsonify({
                "erro":
                f"Coluna de valor não encontrada. Colunas={df.columns.tolist()}"
            }), 200

        # -----------------------------
        # Datas do gráfico
        # -----------------------------
        dates = sorted(
            df["datetime"]
            .dt.strftime("%Y-%m-%d")
            .unique()
            .tolist()
        )

        series = []

        # -----------------------------
        # CETESB
        # -----------------------------
        for pol in cetesb_gases:

            df_pol = df[
                df["pollutant"] == pol
            ].copy()

            if len(df_pol) == 0:

                print(
                    f"Sem dados para {pol}"
                )

                continue

            df_pol = df_pol.sort_values(
                "datetime"
            )

            valores = []

            for d in dates:

                linha_data = df_pol[
                    df_pol["datetime"]
                    .dt.strftime("%Y-%m-%d") == d
                ]

                if len(linha_data):

                    valores.append(
                        float(
                            linha_data.iloc[0][valor_col]
                        )
                    )

                else:

                    valores.append(None)

            cfg = CETESB_CONFIG.get(pol, {})

            series.append({

                "name": f"CETESB {pol}",

                "values": valores,

                "color": cfg.get("color", "black"),

                "unit": cfg.get("unit", ""),

                "satellite": False,

                "marker": "circle"
            })

        # -----------------------------
        # SATÉLITE 
        # -----------------------------

        datas_unicas = pd.to_datetime(
            dates
        )

        for pol in sat_gases:

            if pol not in SAT_CONFIG:

                continue

            cfg = SAT_CONFIG[pol]

            sat_dates, sat_values = (
                get_satellite_series(
                    sat_index=cfg["index"],
                    datas_unicas=datas_unicas,
                    lat_station=lat_station,
                    lon_station=lon_station,
                    delta=0.05,
                    scale=cfg["scale"]
                )
            )

            sat_map = {}

            for d, v in zip(
                sat_dates,
                sat_values
            ):

                sat_map[
                    pd.Timestamp(d)
                    .strftime("%Y-%m-%d")
                ] = float(v)

            valores = []

            for d in dates:

                valores.append(
                    sat_map.get(d, None)
                )

            # series.append({

            #     "name": f"S5P {pol}",

            #     "values": valores
            # })       

            series.append({

                "name": cfg["label"],

                "values": valores,

                "color": cfg["color"],

                "marker": cfg["marker"],

                "unit": cfg.get("unit",""),

                "satellite": True
            })

        print("DATES=", dates)

        print("SERIES=")

        for s in series:
            print(
                s["name"],
                len(s["values"])
            )

        print("================================")
        print("codigo =", codigo)
        print("nome   =", nome_estacao)
        print("================================")        

        return jsonify({
            "station": {
                "codigo": codigo,
                "nome": nome_estacao
            },
            "start": start,
            "end": end,
            "dates": dates,
            "series": series
        })


    except Exception as e:

        import traceback
        traceback.print_exc()

        return jsonify({
            "erro": str(e)
        }), 500


# Verifica as estações que tem arquivos de dados csv
# e comunica com o viewer.js e deixa o marcador na 
# cor cinza. 
@app.route("/api/cetesb/stations_with_data")
def stations_with_data():

    pasta = "/data/cetesb/media_diaria_csvs"

    codigos = set()

    if os.path.exists(pasta):

        for f in os.listdir(pasta):

            if f.endswith(".csv"):

                codigo = f.split("_")[0]
                codigos.add(codigo)

    return jsonify(sorted(list(codigos)))



# Caminho dos dados
STATIONS_DF, STATIONS_DICT = load_stations(
    CETESB_JSON
)



SAT_INDEX = {
    "O3": build_satellite_index(
        "/data/geotiff/ozone_total_vertical_column"
    ),
    "CO": build_satellite_index(
        "/data/geotiff/carbonmonoxide_total_column"
    ),
    "AI": build_satellite_index(
        "/data/geotiff/aerosol_index_354_388"
    ),
    "NO2": build_satellite_index(
        "/data/geotiff/nitrogendioxide_tropospheric_column"
    ),
    "SO2": build_satellite_index(
        "/data/geotiff/sulfurdioxide_total_vertical_column"
    ),
    "CH4": build_satellite_index(
        "/data/geotiff/methane_mixing_ratio"
    )
}

SAT_CONFIG = create_sat_config(
    SAT_INDEX
)


CETESB_CONFIG = {

    "O3": {
        "color": "blue",
        "unit": "µg/m³"
    },

    "MP25": {
        "color": "brown",
        "unit": "µg/m³"
    },

    "MP10": {
        "color": "purple",
        "unit": "µg/m³"
    },

    "NO2": {
        "color": "orange",
        "unit": "µg/m³"
    },

    "SO2": {
        "color": "green",
        "unit": "µg/m³"
    },

    "CO": {
        "color": "red",
        "unit": "ppm"
    }
}


if __name__ == "__main__":
    #app.run(debug=True)
    app.run(host="0.0.0.0", port=5000, debug=True)
