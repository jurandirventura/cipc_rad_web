// atualizando 10jun2026 - Inclui Cetesb
// var map = L.map('map',{
// center:[-15,-55],
// zoom:4,
// worldCopyJump:false,
// maxBounds:[[-85,-180],[85,180]],
// maxBoundsViscosity:1.0
// })

// L.tileLayer(
// 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
// {noWrap:true}
// ).addTo(map)

var map = L.map("map",{
    center:[-15,-55],
    zoom:4,
    worldCopyJump:false,
    maxBounds:[[-85,-180],[85,180]],
    maxBoundsViscosity:1.0
});

//
// BASEMAPS
//

const osm = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        noWrap:true,
        attribution:"© OpenStreetMap"
    }
);

const googleSat = L.tileLayer(
    "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    {
        noWrap:true,
        attribution:"Google"
    }
);

const esri = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        attribution:"Esri"
    }
);

const cartoDark = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution:"Carto"
    }
);

const cartoLight = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
        attribution:"Carto"
    }
);

// mapa inicial
osm.addTo(map);



window.activeChart = null;


var layers=[]

var municipiosLayer = L.layerGroup();

var estadosLayer = L.layerGroup();

var riosLayer = L.layerGroup();

var brasilLayer = L.layerGroup();

var gradeLayer = L.layerGroup();



// timeline
var timelineDates=[]
var timelineLayer=null
var timelineInterval=null

// cache global
var geotiffCache={}

// pixel chart
var pixelChart=null
var clickLat=null
var clickLon=null

// timeline chart
var timelineChart=null

// Colormap cache
var colormapCache = {}

// Ponto clicado no mapa
var clickLat=null
var clickLon=null
var clickMarker = null

// CETESB
var cetesbLayer = L.layerGroup().addTo(map)
var selectedStation = null

// Mapa
const baseMaps = {

    "OpenStreetMap": osm,

    "Google Satélite": googleSat,

    "ESRI World Imagery": esri,

    "Carto Dark": cartoDark,

    "Carto Light": cartoLight

};

const overlayMaps = {

    "Municípios": municipiosLayer,

    "Estados": estadosLayer,

    "Rios": riosLayer,

    "Estações CETESB": cetesbLayer,

    "Limites Brasil": brasilLayer,

    "Grade Lat/Lon": gradeLayer

};

var layerControl =
    L.control.layers(
        baseMaps,
        overlayMaps,
        {
            collapsed:true
        }
    ).addTo(map);


// CAMADAS DE OPÇÃO DO MAPA: ESTADOS, MUNICÍPIOS ...
// fetch("/static/geojson/municipios.geojson")
fetch("/static/geojson/geojs-100-mun.json")
.then(r => r.json())
.then(g => {

    L.geoJSON(g,{
        style:{
            color:"#666",
            weight:0.5,
            fill:false
        }
    }).addTo(municipiosLayer);

});

// fetch("/static/geojson/estados.geojson")
fetch("/static/geojson/estados.geojson")
.then(r => r.json())
.then(g => {

    L.geoJSON(g,{
        style:{
            color:"#000",
            weight:1,
            fill:false
        }
    }).addTo(estadosLayer);

});

// fetch("/static/geojson/limites_brasil.geojson")
fetch("/static/geojson/geoBoundaries-BRA-ADM2_simplified.geojson")
.then(r => r.json())
.then(g => {

    L.geoJSON(g,{
        style:{
            color:"red",
            weight:2,
            fill:false
        }
    }).addTo(brasilLayer);

});

// fetch("/static/geojson/rios.geojson")
// .then(r => r.json())
// .then(g => {

//     L.geoJSON(g,{
//         style:{
//             color:"blue",
//             weight:1
//         }
//     }).addTo(riosLayer);

// });

for(let lat=-60; lat<=15; lat+=5){

    L.polyline(
        [[lat,-90],[lat,-20]],
        {
            color:"#999",
            weight:0.5,
            opacity:0.6
        }
    ).addTo(gradeLayer);

}

for(let lon=-90; lon<=-20; lon+=5){

    L.polyline(
        [[-60,lon],[15,lon]],
        {
            color:"#999",
            weight:0.5,
            opacity:0.6
        }
    ).addTo(gradeLayer);

}




// Váriável global para o gráfico de comparação
let compareChart = null;

// Cores dos produtos no gráfico
const COLORS = {

    "O3":"blue",
    "CO":"red",
    "MP10":"purple",
    "MP25":"brown",
    "NO2":"orange",
    "SO2":"green",

    "AI":"darkviolet",

    "CH4":"olive"
};

const LEGEND_ORDER = [

    "CETESB O3",
    "S5P O3",

    "CETESB MP25",
    "CETESB MP10",
    "S5P AI",

    "CETESB NO2",
    "S5P NO2",

    "CETESB SO2",
    "S5P SO2",

    "CETESB CO",
    "S5P CO",

    "S5P CH4"
];


UNIDADES = {

    "O3":"µg/m³",
    "NO2":"µg/m³",
    "SO2":"µg/m³",
    "CO":"ppm",
    "MP10":"µg/m³",
    "MP25":"µg/m³"
}

// ---------------------
async function init(){

let produtos = await (await fetch("/api/produtos")).json()

let p = document.getElementById("produto")

produtos.forEach(x=>{
    let o=document.createElement("option")
    o.value=x
    o.text=x
    p.add(o)
})

loadAnos()

// NOVO
loadCetesbStations()
}

//----------------------

async function compareSeries() {

    if (!selectedStation) {
        alert("Selecione uma estação CETESB");
        return;
    }

    console.log(
        "selectedStation=",
        selectedStation
    );

    let cetesb = [];

    document
        .querySelectorAll(".cetesbGas:checked")
        .forEach(cb => cetesb.push(cb.value));

    let sat = [];

    document
        .querySelectorAll(".satGas:checked")
        .forEach(cb => sat.push(cb.value));

    let goes = [];

    document
        .querySelectorAll(".goesGas:checked")
        .forEach(cb => goes.push(cb.value));

    console.log("cetesb=", cetesb);
    console.log("sat=", sat);
    console.log("goes=", goes);

    const start =
        document.getElementById("startDate").value;

    const end =
        document.getElementById("endDate").value;

    let url =
        `/api/compare_series?station=${encodeURIComponent(selectedStation.codigo)}`;

    cetesb.forEach(g => {
        url += `&cetesb=${encodeURIComponent(g)}`;
    });

    sat.forEach(g => {
        url += `&sat=${encodeURIComponent(g)}`;
    });

    goes.forEach(g => {
        url += `&goes=${encodeURIComponent(g)}`;
    });

    url += `&start=${encodeURIComponent(start)}`;
    url += `&end=${encodeURIComponent(end)}`;

    console.log("URL=", url);
    console.log("ANTES DO FETCH");

    console.log("URL DA API =", url);
    console.log("ORIGIN =", window.location.origin);


    // =====================================================
    // FETCH
    // =====================================================

    let resp;

    try {

        resp = await fetch(url, {
            method: "GET",
            cache: "no-store"
        });

    } catch (erro) {

        console.error(
            "ERRO REAL NO FETCH:",
            erro
        );

        alert(
            "Erro de comunicação com a API."
        );

        return;
    }


    console.log("FETCH TERMINOU");
    console.log("STATUS=", resp.status);
    console.log("OK=", resp.ok);


    // =====================================================
    // JSON
    // =====================================================

    let data;

    try {

        data = await resp.json();

    } catch (erro) {

        console.error(
            "ERRO AO CONVERTER JSON:",
            erro
        );

        alert(
            "A API retornou uma resposta inválida."
        );

        return;
    }


    console.log("JSON RECEBIDO:", data);
    console.log("SERIES:", data.series);


    if (!resp.ok) {

        console.error(
            "ERRO HTTP:",
            resp.status,
            data
        );

        alert(
            data.erro ||
            `Erro HTTP ${resp.status}`
        );

        return;
    }


    if (data.erro) {

        alert(data.erro);
        return;
    }


    window.lastCompareData = data;


    // =====================================================
    // DESENHAR GRÁFICO
    // =====================================================

    try {

        console.log(
            "ANTES DE drawCompareChart()"
        );

        drawCompareChart(data);

        console.log(
            "DEPOIS DE drawCompareChart()"
        );

    } catch (erro) {

        console.error(
            "ERRO DENTRO DE drawCompareChart():",
            erro
        );

        console.error(
            "STACK:",
            erro.stack
        );

        alert(
            "A API respondeu corretamente, mas ocorreu um erro ao desenhar o gráfico. Veja o console."
        );

        return;
    }
}


// async function compareSeries() {

//     if (!selectedStation) {
//         alert("Selecione uma estação CETESB");
//         return;
//     }

//     console.log(
//         "selectedStation=",
//         selectedStation
//     );

//     let cetesb = [];

//     document
//         .querySelectorAll(".cetesbGas:checked")
//         .forEach(cb => cetesb.push(cb.value));

//     let sat = [];

//     document
//         .querySelectorAll(".satGas:checked")
//         .forEach(cb => sat.push(cb.value));

//     let goes = [];

//     document
//         .querySelectorAll(".goesGas:checked")
//         .forEach(cb => goes.push(cb.value));

//     console.log("cetesb=", cetesb);
//     console.log("sat=", sat);
//     console.log("goes=", goes);

//     const start =
//         document.getElementById("startDate").value;

//     const end =
//         document.getElementById("endDate").value;

//     let url =
//         `/api/compare_series?station=${encodeURIComponent(selectedStation.codigo)}`;

//     cetesb.forEach(g => {
//         url += `&cetesb=${encodeURIComponent(g)}`;
//     });

//     sat.forEach(g => {
//         url += `&sat=${encodeURIComponent(g)}`;
//     });

//     goes.forEach(g => {
//         url += `&goes=${encodeURIComponent(g)}`;
//     });

//     url += `&start=${encodeURIComponent(start)}`;
//     url += `&end=${encodeURIComponent(end)}`;

//     console.log("URL=", url);
//     console.log("ANTES DO FETCH");

//     // drawCompareChart(data);

//     fetch(url)
//         .then(response => {
//             console.log("RESPONSE:", response);
//             console.log("STATUS:", response.status);

//             if (!response.ok) {
//                 throw new Error(`HTTP ${response.status}`);
//             }

//             return response.json();
//         })
//         .then(data => {
//             console.log("JSON RECEBIDO:", data);
//             console.log("SERIES:", data.series);

//             drawCompareChart(data);
//         })
//         .catch(error => {
//             console.error("ERRO:", error);
//         });

//         console.log("ENTROU NO GRÁFICO...");

//         console.log("GRÁFICO 1");

//         const canvas =
//             document.getElementById("pixelChart");

//         console.log("GRÁFICO 2 - canvas=", canvas);

//         const ctx =
//             canvas.getContext("2d");

//         console.log("GRÁFICO 3 - ctx=", ctx);       


    // try {

    //     const resp = await fetch(url, {
    //         method: "GET",
    //         cache: "no-store"
    //     });

    //     console.log(
    //         "FETCH TERMINOU"
    //     );

    //     console.log(
    //         "STATUS=",
    //         resp.status
    //     );

    //     console.log(
    //         "OK=",
    //         resp.ok
    //     );

    //     if (!resp.ok) {

    //         const textoErro =
    //             await resp.text();

    //         throw new Error(
    //             `HTTP ${resp.status}: ${textoErro}`
    //         );
    //     }

    //     const data =
    //         await resp.json();

    //     console.log(
    //         "JSON=",
    //         data
    //     );

    //     window.lastCompareData = data;

    //     if (data.erro) {

    //         alert(data.erro);
    //         return;
    //     }

    //     document.getElementById(
    //         "comparePanel"
    //     ).style.display = "flex";

    //     console.log(
    //         "RETORNO=",
    //         data
    //     );

    //     // drawCompareChart(data);

    // } catch (erro) {

    //     console.error(
    //         "ERRO COMPLETO NO FETCH:",
    //         erro
    //     );

    //     alert(
    //         "Erro ao consultar a API. Veja o console."
    //     );
    // }
// }


// // até 12ago2026
// async function compareSeries() {

//     if(!selectedStation){
//         alert("Selecione uma estação CETESB");
//         return;
//     }

//     console.log(
//         "selectedStation=",
//         selectedStation
//     );

//     let cetesb=[];

//     document
//       .querySelectorAll(".cetesbGas:checked")
//       .forEach(cb => cetesb.push(cb.value));

//     console.log("cetesb=", cetesb);

//     let sat=[];

//     document
//       .querySelectorAll(".satGas:checked")
//       .forEach(cb => sat.push(cb.value));

//     console.log("sat=", sat);

//     let goes=[];

//     document
//         .querySelectorAll(".goesGas:checked")
//         .forEach(cb => goes.push(cb.value));

//     console.log("goes=", goes);



    
//     let start =
//       document.getElementById("startDate").value;

//     let end =
//       document.getElementById("endDate").value;

//     let url =
//       `/api/compare_series?station=${selectedStation.codigo}`;

//     cetesb.forEach(g =>
//         url += `&cetesb=${g}`
//     );

//     sat.forEach(g =>
//         url += `&sat=${g}`
//     );

//     goes.forEach(g =>
//         url += `&goes=${g}`
//     );

//     url += `&start=${start}`;
//     url += `&end=${end}`;

//     console.log("URL=", url);

//     let resp = await fetch(url);

//     let data = await resp.json();

//     console.log(
//     JSON.stringify(data, null, 2)
//     );

//     window.lastCompareData = data;

//     console.log("RETORNO=", data);

//     if(data.erro){

//         alert(data.erro);
//         return;
//     }

//     document.getElementById(
//         "comparePanel"
//     ).style.display="flex";

//     drawCompareChart(data);

// }

// ----------------------------------------------------

async function loadCetesbStations(){

    let stations = await (
        await fetch("/api/cetesb/stations")
    ).json();

    let stationsWithData = await (
        await fetch("/api/cetesb/stations_with_data")
    ).json();

    stationsWithData = new Set(stationsWithData);

    const grouped = {};

    stations.forEach(st => {

        if(
            st.latitude == null ||
            st.longitude == null ||
            isNaN(st.latitude) ||
            isNaN(st.longitude)
        ){
            console.log("Estação inválida:", st);
            return;
        }

        const key =
            `${st.latitude}_${st.longitude}`;

        if(!grouped[key])
            grouped[key] = [];

        grouped[key].push(st);

    });

    Object.values(grouped).forEach(group => {

        const st0 = group[0];

        const temDados = group.some(
            st => stationsWithData.has(st.codigo)
        );

        let marker = L.circleMarker(
            [st0.latitude, st0.longitude],
            {
                radius: 7,
                color: "black",
                fillColor: temDados ? "yellow" : "gray",
                fillOpacity: 0.9
            }
        );

        marker.addTo(cetesbLayer);

        let popup = group.map(st => {

            const ok =
                stationsWithData.has(st.codigo);

            return `
                <div>
                    <b>${st.nome}</b><br>
                    Código: ${st.codigo}<br>
                    CSV:
                    <span style="
                        color:${ok ? 'green' : 'red'};
                        font-weight:bold;">
                        ${ok ? 'SIM' : 'NÃO'}
                    </span>
                </div>
                <hr>
            `;

        }).join("");

        marker.bindPopup(popup);

        marker.on("click", function(){

            if(group.length === 1){

                selectedStation = group[0];

            } else {

                const comDados =
                    group.find(
                        st => stationsWithData.has(st.codigo)
                    );

                selectedStation =
                    comDados || group[0];
            }

            console.log(
                "Estação selecionada:",
                selectedStation.codigo
            );

        });

    });

}

// ---------------------

async function loadAnos() {

    const produto = document.getElementById("produto").value;

    const selectAno = document.getElementById("ano");

    selectAno.innerHTML = "";

    if (!produto) {
        return;
    }

    const anos = await (
        await fetch(`/api/anos/${produto}`)
    ).json();

    anos.forEach(ano => {

        const option = document.createElement("option");

        option.value = ano;
        option.text = ano;

        selectAno.add(option);

    });

    if (anos.length > 0) {

        await loadDatas();

    }
}


// ---------------------

async function loadDatas() {

    const produto = document.getElementById("produto").value;
    const ano = document.getElementById("ano").value;

    const selectData = document.getElementById("data");

    selectData.innerHTML = "";

    if (!produto || !ano) {
        return;
    }

    const datas = await (
        await fetch(`/api/datas/${produto}/${ano}`)
    ).json();

    datas.forEach(data => {

        const option = document.createElement("option");

        option.value = data;
        option.text = formatarData(data);

        selectData.add(option);

    });

    if (datas.length > 0) {

        await loadHoras();

    }
}


// ---------------------


async function loadHoras() {

    const produto = document.getElementById("produto").value;
    const ano = document.getElementById("ano").value;
    const data = document.getElementById("data").value;

    const horaContainer =
        document.getElementById("horaContainer");

    const selectHora =
        document.getElementById("hora");

    selectHora.innerHTML = "";

    horaContainer.style.display = "none";

    if (!produto || !ano || !data) {
        return;
    }

    const horas = await (
        await fetch(
            `/api/horas/${produto}/${ano}/${data}`
        )
    ).json();

    /*
     * Se existem horários, mostra o campo.
     */

    if (horas.length > 0) {

        horaContainer.style.display = "block";

        horas.forEach(hora => {

            const option =
                document.createElement("option");

            option.value = hora;
            option.text = hora;

            selectHora.add(option);

        });

    }
}


// ---------------------
async function loadColormap(product){

if(colormapCache[product]){
return colormapCache[product]
}

const response = await fetch(`/api/colormap/${product}`)
let cmap = await response.json()

colormapCache[product] = cmap

return cmap
}


function selectStation(codigo){

    fetch("/api/cetesb/stations")
    .then(r => r.json())
    .then(stations => {

        const st = stations.find(
            s => s.codigo === codigo
        );

        if(st){

            selectedStation = st;

            console.log(
                "Estação selecionada:",
                st.codigo,
                st.nome
            );

            alert(
                `Selecionada: ${st.codigo} - ${st.nome}`
            );
        }
    });

}


function markerToChartJS(marker)
{
    const map = {

        "*": "star",

        "^": "triangle",

        "D": "rectRot",

        "s": "rect",

        "P": "crossRot",

        "circle": "circle"
    };

    return map[marker] || "circle";
}


//-------------------

function showPanel(id){
    document.getElementById("comparePanel").style.display = "none";
    document.getElementById("timelinePanel").style.display = "none";
    document.getElementById(id).style.display = "block";
}

// function showPanel(panel) {
//     document.getElementById("comparePanel").style.display = panel === "compare" ? "block" : "none";
//     document.getElementById("timelinePanel").style.display = panel === "timeline" ? "block" : "none";
// }

//----------------- 

function createLegend(cmap, nome, layer){

let div = document.createElement("div")
div.className = "legendItem"

const colors = cmap.colors.join(", ")

div.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;">
<b>${nome}</b>
<button class="removeBtn">❌</button>
</div>

<div style="width:100%;height:12px;
background:linear-gradient(to right, ${colors});
border:1px solid black;"></div>

<div style="display:flex;justify-content:space-between;font-size:10px">
<span>${cmap.vmin}</span>
<span>${cmap.vmax}</span>
</div>

<div style="font-size:10px;text-align:right;">
${cmap.unit || ""}
</div>

<div style="margin-top:5px;">
Opacidade:
<input type="range" min="0" max="1" step="0.05" value="1" class="opacitySlider">
</div>
`

// --------------------
// REMOVER CAMADA
// --------------------
div.querySelector(".removeBtn").onclick = function(){

    map.removeLayer(layer)
    layers = layers.filter(l => l !== layer)
    div.remove()
}

// --------------------
// OPACIDADE
// --------------------
div.querySelector(".opacitySlider").oninput = function(e){

    let value = parseFloat(e.target.value)

    // mostra valor ao passar o mouse
    e.target.title = value

    // aplica opacidade
    if(layer.setOpacity){
        layer.setOpacity(value)
    }

    if(layer.setStyle){
        layer.setStyle({opacity:value, fillOpacity:value})
    }

}

document.getElementById("legendPanel").appendChild(div)

return div
}


//----------------------
// Seta cor para o gráfico
function getSeriesColor(name){

    if(name.includes("O3")) return "blue";

    if(name.includes("CO")) return "red";

    if(name.includes("MP10")) return "purple";

    if(name.includes("MP25")) return "brown";

    if(name.includes("NO2")) return "orange";

    if(name.includes("SO2")) return "green";

    if(name.includes("AI")) return "darkviolet";

    if(name.includes("CH4")) return "olive";

    return "black";
}


// ---------------------

async function getGeoTiff(produto, data, hora = "") {

    // =====================================================
    // CACHE
    // =====================================================

    let key = produto + "_" + data;

    if (produto === "goes_aod" && hora) {

        key += "_" + hora.replace(/:/g, "");
    }

    if (geotiffCache[key]) {

        return geotiffCache[key];
    }

    // =====================================================
    // ANO
    // =====================================================

    let ano = data.substring(0, 4);

    // =====================================================
    // URL
    // =====================================================

    let url;

    if (produto === "goes_aod" && hora) {

        url =
            "/geotiff/" +
            produto +
            "/" +
            ano +
            "/" +
            data +
            "/" +
            hora;

    } else {

        url =
            "/geotiff/" +
            produto +
            "/" +
            ano +
            "/" +
            data;
    }

    console.log("GeoTIFF URL:", url);

    // =====================================================
    // DOWNLOAD
    // =====================================================

    let response = await fetch(url);

    if (!response.ok) {

        throw new Error(
            "Erro ao carregar GeoTIFF: " +
            response.status +
            " - " +
            url
        );
    }

    let arrayBuffer =
        await response.arrayBuffer();

    let georaster =
        await parseGeoraster(arrayBuffer);

    // =====================================================
    // CACHE
    // =====================================================

    geotiffCache[key] = georaster;

    return georaster;
}

// ---------------------

async function addLayer() {

    const produto =
        document.getElementById("produto").value;

    const data =
        document.getElementById("data").value;

    let hora = "";

    // =====================================================
    // GOES-AOD possui horário
    // =====================================================

    if (produto === "goes_aod") {

        hora =
            document.getElementById("hora").value;

        if (!hora) {

            alert(
                "Selecione o horário do GOES-AOD."
            );

            return;
        }
    }

    // =====================================================
    // Nome da camada
    // =====================================================

    let nome =
        produto + " " + data;

    if (hora) {

        nome += " " + hora;
    }

    // =====================================================
    // Verificar duplicidade
    // =====================================================

    if (layers.find(l => l.nome === nome)) {

        alert("Camada já carregada");

        return;
    }

    // =====================================================
    // Colormap
    // =====================================================

    let cmap =
        await loadColormap(produto);

    // =====================================================
    // GeoTIFF
    // =====================================================

    let georaster =
        await getGeoTiff(
            produto,
            data,
            hora
        );

    // =====================================================
    // Criar camada
    // =====================================================

    let layer =
        createRasterLayer(
            georaster,
            cmap
        );

    layer.nome = nome;
    layer.cmap = cmap;

    layer.addTo(map);

    layers.push(layer);

    // =====================================================
    // Legenda
    // =====================================================

    createLegend(
        cmap,
        nome,
        layer
    );
}

// ---------------------

function createRasterLayer(georaster,cmap){

return new GeoRasterLayer({

georaster:georaster,
opacity:0.7,
resolution:128,
wrapX:false,

pixelValuesToColorFn:function(pixelValues){

let v = pixelValues[0]

// -------------------------
// BINÁRIO
// -------------------------
if(cmap.type === "binary"){

    if(v === 0 || v === undefined) return null

    return "#000000"
}

// -------------------------
// CONTÍNUO
// -------------------------
if(v === cmap.nodata || v === undefined) return null

let ratio = (v - cmap.vmin) / (cmap.vmax - cmap.vmin)
ratio = Math.max(0, Math.min(1, ratio))

return chroma.scale(cmap.colors)(ratio).hex()

}

})
}

// ---------------------
async function loadTimeline(){

let produto=document.getElementById("produto").value
let start=document.getElementById("startDate").value
let end=document.getElementById("endDate").value

if(!start || !end){
alert("Selecione data inicial e final")
return
}

start=start.replaceAll("-","")
end=end.replaceAll("-","")

timelineDates=await (await fetch(
"/api/datas_interval/"+produto+"/"+start+"/"+end
)).json()

let slider=document.getElementById("timeSlider")
slider.max=timelineDates.length-1
slider.value=0

updateTimeline()
}

// ---------------------

async function preloadNext(produto,index){

let next = index + 1

if(next >= timelineDates.length) return

let data = timelineDates[next]

await getGeoTiff(produto,data)
}

async function updateTimeline(){

if(timelineDates.length===0) return

let produto = document.getElementById("produto").value
let slider = document.getElementById("timeSlider")

let index = parseInt(slider.value)
let data = timelineDates[index]

document.getElementById("timeLabel").innerHTML = data

// remove layer anterior
if(timelineLayer){
map.removeLayer(timelineLayer)
timelineLayer = null
}

// carrega dados
let georaster = await getGeoTiff(produto,data)
let cmap = await loadColormap(produto)

// cria layer
timelineLayer = createRasterLayer(georaster,cmap)
timelineLayer.georaster = georaster

timelineLayer.addTo(map)

// 🔥 FORÇA render REAL
await new Promise(resolve => {
requestAnimationFrame(() => {
timelineLayer.redraw()

// pequeno delay garante pintura na tela
setTimeout(resolve, 100)
})
})

await preloadNext(produto,index)

}


// ---------------------

async function playTimeline(){

stopTimeline()

// let speed = parseInt(document.getElementById("speedSlider")?.value) || 500

let speed = Math.max(800, parseInt(document.getElementById("speedSlider")?.value) || 800)

//let speed = Math.max(900, parseInt(...) || 900)

let slider = document.getElementById("timeSlider")

timelineInterval = true  // flag

while(timelineInterval){

let i = parseInt(slider.value)

if(i >= timelineDates.length - 1){
stopTimeline()
break
}

// avança
slider.value = i + 1

// 🔥 AGORA ESPERA CARREGAR
await updateTimeline()

// 🔥 espera tempo entre frames
await new Promise(r => setTimeout(r, speed))

}

}

//----------------------

function stopTimeline(){
timelineInterval = false
}

//

function createPixelChart(values, cmap, produto){

// function createTimelineChart(values, cmap, produto){


//let ctx=document.getElementById("pixelChart").getContext("2d")

let ctx =
document.getElementById("timelineChart")
.getContext("2d")

// if(pixelChart){
// pixelChart.destroy()
// }

if(timelineChart){
timelineChart.destroy()
}

let title = cmap.title || produto
let shortName = cmap.short_name || produto
let unit = cmap.unit || ""
let description = cmap.description || ""


if(window.timelineChart)
{
    window.timelineChart.destroy();
}

// timelineChart=new Chart(ctx,{
window.timelineChart = new Chart(ctx,{
type:"line",


data:{
labels: timelineDates,
datasets:[{
label: shortName,
data:values,
borderWidth:2,
fill:false
}]
},

options:{
responsive:true,
maintainAspectRatio:false,

plugins:{
title:{
display:true,
text:title
},
subtitle:{
display:true,
text:`Lat: ${clickLat.toFixed(3)} | Lon: ${clickLon.toFixed(3)}`
},
tooltip:{
enabled:true,
mode:'nearest',
intersect:false,  
callbacks:{
label:function(context){
return context.parsed.y+" "+unit
},
afterBody:function(){
return description
}
}
}
},

scales:{
    y:{
    min:cmap.vmin,
    max:cmap.vmax,
    title:{
    display:true,
    text: unit ? `Value (${unit})` : "Value"
    }
    },

    // Incluído configuração para y2 em 14/ago/2026
    y2:{
    min:cmap.vmin,
    max:cmap.vmax,
    title:{
    display:true,
    text: unit ? `Value (${unit})` : "Value"
    }
    }

}
}

})
}

// ---------------------
async function buildPixelSeries(){

if(timelineDates.length===0){
alert("Carregue a timeline primeiro")
return
}

let produto=document.getElementById("produto").value
let values=[]

for(let data of timelineDates){
let georaster=await getGeoTiff(produto,data)

let v=getPixelValue({georaster},clickLat,clickLon)
values.push(v)
}

let cmap = await loadColormap(produto)

// document.getElementById("pixelChart").style.display = "none";
// document.getElementById("timelineChart").style.display = "block";

document.getElementById(
    "timelinePanel"
).style.display="block";

createPixelChart(values,cmap,produto)

}

// ---------------------

function getPixelValue(layer,lat,lng){

let r=layer.georaster

let col=Math.floor((lng-r.xmin)/r.pixelWidth)
let row=Math.floor((r.ymax-lat)/r.pixelHeight)

if(row<0||col<0||row>=r.height||col>=r.width){
return null
}

return r.values[0][row][col]
}

//----------------------

function sanitizeCoord(v)
{
    let sinal = v < 0 ? "n" : "";

    return sinal +
        Math.abs(v)
        .toFixed(2)
        .replace(".", "p");
}

//---------------------

function getCompareFilename(ext)
{
    let st =
        selectedStation || {};

    let codigo =
        st.codigo || "sem_codigo";

    let nome =
        (st.nome || "sem_nome")
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "");

    let start =
        (document.getElementById("startDate").value || "")
        .replaceAll("-", "");

    let end =
        (document.getElementById("endDate").value || "")
        .replaceAll("-", "");

    return `cetesb_${codigo}_${nome}_Sentinel5P_${start}_${end}.${ext}`;
}

//---------------------

function getTimelineFilename(ext)
{
    let produto =
        document.getElementById("produto").value || "produto";

    let lat =
        sanitizeCoord(clickLat);

    let lon =
        sanitizeCoord(clickLon);

    let start =
        (document.getElementById("startDate").value || "")
        .replaceAll("-", "");

    let end =
        (document.getElementById("endDate").value || "")
        .replaceAll("-", "");

    return `timeseries_${produto}_${lat}_${lon}_${start}_${end}.${ext}`;
}

//---------------------

function getExportFilename(ext)
{
    //
    // COMPARE PANEL
    //
    if(window.activeChartType === "compare")
    {
        if(!window.lastCompareData)
            return "comparacao." + ext;

        let codigo =
            window.lastCompareData.station.codigo;

        let nome =
            window.lastCompareData.station.nome
            .replaceAll(" ", "_")
            .replaceAll("/", "_");

        let ini =
            window.lastCompareData.start
            .replaceAll("-", "");

        let fim =
            window.lastCompareData.end
            .replaceAll("-", "");

        return
            `cetesb_${codigo}_${nome}_Sentinel5P_${ini}_${fim}.${ext}`;
    }

    //
    // TIMELINE
    //
    let produto =
        document.getElementById("produto").value;

    let ini =
        document.getElementById("startDate")
        .value
        .replaceAll("-", "");

    let fim =
        document.getElementById("endDate")
        .value
        .replaceAll("-", "");

    let lat =
        sanitizeCoord(clickLat);

    let lon =
        sanitizeCoord(clickLon);

    return
        `timeseries_${produto}_${lat}_${lon}_${ini}_${fim}.${ext}`;
}

//--------------------

function downloadChartPNG(tipo)
{
    let chart =
        tipo === "compare"
        ? window.compareChart
        : window.timelineChart;

    if(!chart){
        alert("Nenhum gráfico disponível");
        return;
    }

    let nome =
        tipo === "compare"
        ? getCompareFilename("png")
        : getTimelineFilename("png");

    let a = document.createElement("a");
    a.href = chart.toBase64Image();
    a.download = nome;
    a.click();
}

// ---------------------

function downloadChartJPG(tipo)
{
    let canvas =
        tipo === "compare"
        ? document.getElementById("pixelChart")
        : document.getElementById("timelineChart");

    if(!canvas)
    {
        alert("Canvas não encontrado");
        return;
    }

    let nome =
        tipo === "compare"
        ? getCompareFilename("jpg")
        : getTimelineFilename("jpg");

    let tempCanvas =
        document.createElement("canvas");

    tempCanvas.width =
        canvas.width;

    tempCanvas.height =
        canvas.height;

    let ctx =
        tempCanvas.getContext("2d");

    ctx.fillStyle = "#FFFFFF";

    ctx.fillRect(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height
    );

    ctx.drawImage(canvas,0,0);

    let url =
        tempCanvas.toDataURL(
            "image/jpeg",
            0.95
        );

    let a =
        document.createElement("a");

    a.href = url;

    a.download = nome;

    a.click();
}


// ---------------------

// =========================================================
// Redimensionamento automático dos gráficos
// =========================================================

function observeChartResize(panelId, chart) {

    const panel =
        document.getElementById(panelId);

    if (!panel || !chart) {
        return;
    }

    const observer =
        new ResizeObserver(() => {

            chart.resize();

        });

    observer.observe(panel);

    return observer;
}


// ---------------------

function toggleTimeline(){

    let panel =
        document.getElementById("timelinePanel");

    if(
        panel.style.display === "none" ||
        panel.style.display === ""
    ){

        panel.style.display = "flex";

    } else {

        panel.style.display = "none";
    }

    if (window.timelineChart) {

        setTimeout(() => {

            window.timelineChart.resize();

        }, 100);
    }

    map.invalidateSize();
}





// function toggleTimeline(){

// let panel = document.getElementById("timelinePanel")

// if(panel.style.display === "none" || panel.style.display === ""){
// panel.style.display = "block"
// }else{
// panel.style.display = "none"
// }

// map.invalidateSize()
// }

// ---------------------

function downloadCSV(tipo)
{
    let chart =
        tipo === "compare"
        ? window.compareChart
        : window.timelineChart;

    if(!chart)
    {
        alert("Nenhum gráfico disponível");
        return;
    }

    let csv = "";

    if(tipo === "compare" &&
       window.lastCompareData)
    {
        csv +=
            `Estacao;${window.lastCompareData.station.codigo} - ${window.lastCompareData.station.nome}\n`;

        csv +=
            `Periodo;${window.lastCompareData.start} a ${window.lastCompareData.end}\n\n`;
    }

    if(tipo === "timeline")
    {
        csv +=
            `Latitude;${clickLat}\n`;

        csv +=
            `Longitude;${clickLon}\n`;

        csv += "\n";
    }

    csv += "Data";

    chart.data.datasets.forEach(ds =>
    {
        csv += ";" + ds.label;
    });

    csv += "\n";

    chart.data.labels.forEach((data, idx)=>
    {
        csv += data;

        chart.data.datasets.forEach(ds =>
        {
            let valor = ds.data[idx];

            csv += ";" +
                (valor != null ? valor : "");
        });

        csv += "\n";
    });

    let blob =
        new Blob(
            [csv],
            {
                type:
                "text/csv;charset=utf-8;"
            }
        );

    let url =
        URL.createObjectURL(blob);

    let a =
        document.createElement("a");

    a.href = url;

    a.download =
        tipo === "compare"
        ? getCompareFilename("csv")
        : getTimelineFilename("csv");

    a.click();

    URL.revokeObjectURL(url);
}

// ---------------------

function closeChart(){
document.getElementById("comparePanel").style.display="none"
}

// ---------------------

function closeCompareChart()
{
    document.getElementById(
        "comparePanel"
    ).style.display="none";
}


// ---------------------

function closeTimelineChart()
{
    document.getElementById(
        "timelinePanel"
    ).style.display="none";
}

// ---------------------

map.on("click", async function(e){

clickLat = e.latlng.lat
clickLon = e.latlng.lng

// remove marcador anterior
if(clickMarker){
    map.removeLayer(clickMarker)
}

// cria novo marcador
clickMarker = L.marker([clickLat, clickLon]).addTo(map)

// popup opcional
clickMarker.bindPopup(
    `Lat: ${clickLat.toFixed(4)}<br>Lon: ${clickLon.toFixed(4)}`
).openPopup()

// gera gráfico
await buildPixelSeries()

})


let lastTime = 0

map.on("mousemove", function(e){

let lat = e.latlng.lat
let lng = e.latlng.lng

let txt = `Lat: ${lat.toFixed(3)} Lon: ${lng.toFixed(3)}<br>`

let now = Date.now()

if(now - lastTime > 50){

lastTime = now

// =========================
// CAMADAS (addLayer)
// =========================
layers.forEach(layer => {

if(!layer.options || !layer.options.georaster) return

let v = getPixelValue(
{georaster: layer.options.georaster},
lat,
lng
)

if(v !== null && v !== -9999){
txt += `${layer.nome}: ${v}<br>`
}

})

// =========================
// TIMELINE
// =========================
if(timelineLayer && timelineLayer.options.georaster){

let produto = document.getElementById("produto").value

let v = getPixelValue(
{georaster: timelineLayer.options.georaster},
lat,
lng
)

if(v !== null && v !== -9999){
txt += `${produto} (timeline): ${v}<br>`
}

}

}

document.getElementById("pixelValues").innerHTML = txt

})

//---------------------

function dragElement(elmnt){

    let pos1=0,pos2=0,pos3=0,pos4=0

    let header = elmnt.querySelector(".chartHeader");

    if(!header) return; // proteção importante

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e){
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDrag;
        document.onmousemove = drag;
    }

    function drag(e){
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDrag(){
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

//---------------------

function formatDateBR(dateStr)
{
    let p = dateStr.split("-");

    return `${p[2]}/${p[1]}/${p[0]}`;
}

function formatarData(data) {

    if (data.length !== 8) {
        return data;
    }

    return (
        data.substring(6, 8) + "/" +
        data.substring(4, 6) + "/" +
        data.substring(0, 4)
    );
}


function markerToChartJS(marker)
{
    const markers = {

        "*": "star",

        "^": "triangle",

        "D": "rectRot",

        "s": "rect",

        "P": "crossRot",

        "circle": "circle"
    };

    return markers[marker] || "circle";
}

//---------------------

function openComparePanel()
{
    document.getElementById("comparePanel").style.display =
        "block";
}


//---------------------

function openTimelinePanel()
{
    document.getElementById("timelinePanel").style.display =
        "block";
}


//---------------------

function drawCompareChart(data) {

    console.log("ENTROU NO GRÁFICO");

    const panel =
        document.getElementById("comparePanel");

    panel.style.display = "block";


    const canvas =
        document.getElementById("pixelChart");

    console.log(
        "CANVAS=",
        canvas
    );


    if (!canvas) {

        throw new Error(
            "Canvas #pixelChart não encontrado."
        );
    }


    const ctx =
        canvas.getContext("2d");

    console.log(
        "CTX=",
        ctx
    );


    if (!ctx) {

        throw new Error(
            "Não foi possível obter contexto 2D do canvas."
        );
    }


    // -----------------------------------------------------
    // Destrói gráfico anterior
    // -----------------------------------------------------

    if (window.compareChart) {

        window.compareChart.destroy();

        window.compareChart = null;
    }


    // -----------------------------------------------------
    // Datasets
    // -----------------------------------------------------

    let datasets = [];


    data.series.forEach(s => {

        console.log(
            "CRIANDO DATASET:",
            s.name,
            s.values
        );


        const cor =
            s.color ||
            getSeriesColor(s.name);


        const pointStyle =
            markerToChartJS(
                s.marker || "circle"
            );


        datasets.push({

            label:
                s.unit && s.unit !== ""
                ? `${s.name} (${s.unit})`
                : s.name,

            data: s.values,

            borderColor: cor,

            backgroundColor: cor,

            fill: false,

            tension: 0.2,

            borderWidth:
                s.satellite ? 2 : 1.5,

            borderDash:
                s.satellite ? [8, 4] : [],

            pointRadius:
                s.satellite ? 6 : 3,

            pointHoverRadius:
                s.satellite ? 8 : 5,

            pointStyle: pointStyle,

            yAxisID:
                s.name.includes("CH4")
                ? "y2"
                : "y"
        });

    });


    console.log(
        "DATASETS CRIADOS:",
        datasets
    );


    // -----------------------------------------------------
    // Ordem da legenda
    // -----------------------------------------------------

    datasets.sort((a, b) => {

        let ia =
            LEGEND_ORDER.indexOf(a.label);

        let ib =
            LEGEND_ORDER.indexOf(b.label);

        if (ia === -1) ia = 999;

        if (ib === -1) ib = 999;

        return ia - ib;
    });


    console.log(
        "ORDEM FINAL:"
    );

    datasets.forEach(
        d => console.log(d.label)
    );


    // -----------------------------------------------------
    // Cria gráfico
    // -----------------------------------------------------

    console.log(
        "ANTES DE new Chart()"
    );


    window.compareChart =
        new Chart(ctx, {

            type: "line",

            data: {

                labels: data.dates,

                datasets: datasets
            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                interaction: {

                    mode: "index",

                    intersect: false
                },

                plugins: {

                    title: {

                        display: true,

                        text: [

                            "Qualidade do Ar - Médias Diárias",

                            `Estação: ${data.station.codigo} - ${data.station.nome}`,

                            `Período: ${formatDateBR(data.start)} a ${formatDateBR(data.end)}`
                        ]
                    },

                    legend: {

                        position: "top"
                    },

                    tooltip: {

                        callbacks: {

                            title: function(items) {

                                return formatDateBR(
                                    items[0].label
                                );
                            },

                            label: function(context) {

                                let ds =
                                    context.dataset;

                                let valor =
                                    context.parsed.y;

                                if (valor == null) {
                                    return "";
                                }

                                return `${ds.label}: ${valor.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });


    console.log(
        "CHART CRIADO:",
        window.compareChart
    );


    window.activeChartType =
        "compare";

    openComparePanel();
}


// function drawCompareChart(data){
   
//     console.log("ENTROU NO GRÁFICO");

//     document.getElementById(
//         "comparePanel"
//     ).style.display = "flex";

//     const canvas =
//         document.getElementById(
//             "pixelChart"
//         );
    
//     const ctx = canvas.getContext("2d");        

//     if (window.compareChart) {
//         window.compareChart.destroy();
//         window.compareChart = null;
//     }    

//     // Removido mais abaixo de substituído pelo conteúdo acima
//     // if(window.compareChart)
//     // {
//     //     window.compareChart.destroy();
//     // }

//     let datasets=[];

//     data.series.forEach(s =>
//     {

//         // Acrescentado em 14/08/2026
//         console.log(
//             "DATASET:",
//             s.name,
//             s.values
//         );        

//         const cor =
//             s.color ||
//             getSeriesColor(s.name);

//         const pointStyle =
//             markerToChartJS(
//                 s.marker || "circle"
//             );

//         datasets.push({

//             label:
//                 s.unit && s.unit !== ""
//                 ? `${s.name} (${s.unit})`
//                 : s.name,

//             data: s.values,

//             borderColor: cor,
//             backgroundColor: cor,

//             fill: false,
//             tension: 0.2,

//             borderWidth:
//                 s.satellite ? 2 : 1.5,

//             borderDash:
//                 s.satellite ? [8,4] : [],

//             pointRadius:
//                 s.satellite ? 6 : 3,

//             pointHoverRadius:
//                 s.satellite ? 8 : 5,

//             pointStyle: pointStyle,

//             yAxisID:
//                 s.name.includes("CH4")
//                 ? "y2"
//                 : "y",

//         });
//     });

//     //
//     // ORDENA A LEGENDA
//     //
//     datasets.sort((a,b)=>
//     {
//         let ia = LEGEND_ORDER.indexOf(a.label);
//         let ib = LEGEND_ORDER.indexOf(b.label);

//         if(ia === -1) ia = 999;
//         if(ib === -1) ib = 999;

//         return ia - ib;
//     });

//     console.log("ORDEM FINAL:");
//     datasets.forEach(d => console.log(d.label));    
 
//     document.getElementById("comparePanel").style.display = "flex";


//     // if (window.compareChart) {
//     //     window.compareChart.destroy();
//     //     window.compareChart = null;
//     // }    

//     // Inserido em 14/08/2026
//     console.log("ANTES DO NEW CHART");    


//     window.compareChart =
//         new Chart(ctx, {

//     // substituído pelo conteúdo acima.        
//     // window.compareChart =
//     //     new Chart(canvas,{
//             type:"line",
//             data:{
//                 labels:data.dates,
//                 datasets:datasets
//             },

//             options:{

//                 responsive:true,

//                 maintainAspectRatio:false,

//                 interaction:{
//                     mode:"index",
//                     intersect:false
//                 },

//                 plugins:{

//                     title:{
//                         display:true,
//                         text:[
//                             "Qualidade do Ar - Médias Diárias",
//                             `Estação: ${data.station.codigo} - ${data.station.nome}`,
//                             `Período: ${formatDateBR(data.start)} a ${formatDateBR(data.end)}`
//                         ]
//                     },

//                     legend:{
//                         position:"top"
//                     },

//                     tooltip:{
//                         callbacks:{

//                             title:function(items){

//                                 return formatDateBR(
//                                     items[0].label
//                                 );
//                             },

//                             label:function(context){

//                                 let ds = context.dataset;

//                                 let valor = context.parsed.y;

//                                 if(valor == null)
//                                     return "";

//                                 let unidade =
//                                     ds.unit || "";

//                                 return `${ds.label}: ${valor.toFixed(2)} ${unidade}`;
//                             }
//                         }
//                     }

//                 }
//             }            


//         });
//         // window.activeChart = "compare";
//         // openComparePanel();

//         window.activeChart = "compare";

//         openComparePanel();

//         observeChartResize(
//             "comparePanel",
//             window.compareChart
//         );

//     }
   


//--------------------- 

function drawTimelineChart(values, cmap, produto){

    const ctx = document.getElementById("timelineChart").getContext("2d");

    if (window.timelineChart)
    {
        window.timelineChart.destroy();
    }   

    // timelineChart = new Chart(ctx, {
    window.timelineChart = new Chart(ctx,{
        type: "line",
        data: {
            labels: timelineDates,
            datasets: [{
                label: produto,
                data: values,
                borderWidth: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    window.activeChart = "timeline";
    openTimelinePanel();
}

//----------------------

function openPanel(id){
    document.getElementById("comparePanel").style.display = "none";
    document.getElementById("timelinePanel").style.display = "none";
    document.getElementById(id).style.display = "flex";
}

//----------------------

function closePanel(id){
    document.getElementById(id).style.display = "none";
}

//----------------------

const resizeObserver = new ResizeObserver(() => {

    if(window.compareChart)
        window.compareChart.resize();

    if(window.timelineChart)
        window.timelineChart.resize();
});

const produto = document.getElementById("produto");
const ano = document.getElementById("ano");
const data = document.getElementById("data");
const hora = document.getElementById("hora");

if(produto)
    produto.onchange = loadAnos;

if(ano)
    ano.onchange = loadDatas;

if(data)
    data.onchange = loadHoras;

const timeSlider = document.getElementById("timeSlider");

if(produto) produto.onchange = loadAnos;
if(ano) ano.onchange = loadDatas;
if(timeSlider) timeSlider.oninput = updateTimeline;

document.getElementById("produto")
    .addEventListener("change", loadAnos);

document.getElementById("ano")
    .addEventListener("change", loadDatas);

document.getElementById("data")
    .addEventListener("change", loadHoras);


dragElement(document.getElementById("comparePanel"))
dragElement(document.getElementById("timelinePanel"))
resizeObserver.observe(document.getElementById("comparePanel"));
resizeObserver.observe(document.getElementById("timelinePanel"));
init()

