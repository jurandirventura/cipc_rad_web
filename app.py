from flask import Flask, render_template, jsonify, send_file
import os
import re
import json 

app = Flask(__name__)

DATA_DIR = "/home/jurandir/cipc_output/geotiff"


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

    with open("/home/jurandir/cipc_rad/config/colormaps.json") as f:
        data = json.load(f)

    return jsonify(data[product])

# ---------------------------------------------------


if __name__ == "__main__":
    app.run(debug=True)

