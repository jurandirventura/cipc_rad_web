from flask import Flask, render_template, jsonify, send_file
import os
import re
import json 

from flask import request
import pandas as pd


app = Flask(__name__)

#DATA_DIR = "/home/jurandir/cipc_output/geotiff"

# Retirar o comentário para DOCKER
DATA_DIR = "/data/geotiff"

# (mapeado) CETESB_JSON = "/home/jurandir/cipc_data/cetesb/lista_estacoes.json"
CETESB_JSON = "/data/cetesb/lista_estacoes.json"
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


# # API flask para comparação
# @app.route("/api/compare_series")
# def compare_series():

#     codigo = request.args.get("station")

#     cetesb_gases = request.args.getlist("cetesb")
#     sat_gases = request.args.getlist("sat")

#     start = request.args.get("start")
#     end = request.args.get("end")

#     print(codigo)
#     print(cetesb_gases)
#     print(sat_gases)

#     return jsonify({
#         "station": codigo,
#         "cetesb": cetesb_gases,
#         "sat": sat_gases,
#         "start": start,
#         "end": end
#     })

# API flask para comparação
@app.route("/api/compare_series")
def compare_series():

    codigo = request.args.get("station")

    cetesb_gases = request.args.getlist("cetesb")
    sat_gases = request.args.getlist("sat")

    start = request.args.get("start")
    end = request.args.get("end")

    print(codigo)
    print(cetesb_gases)
    print(sat_gases)

    data_inicio = pd.to_datetime(start)
    data_fim = pd.to_datetime(end)

    resultado = {
        "station": codigo,
        "series": []
    }

    # TEMPORÁRIO
    datas = pd.date_range(
        data_inicio,
        data_fim,
        freq="D"
    )

    resultado["dates"] = [
        d.strftime("%Y-%m-%d")
        for d in datas
    ]

    return jsonify(resultado)



if __name__ == "__main__":
    #app.run(debug=True)
    app.run(host="0.0.0.0", port=5000, debug=True)
