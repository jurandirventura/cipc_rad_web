// atualizando 10jun2026 - Inclui Cetesb
var map = L.map('map',{
center:[-15,-55],
zoom:4,
worldCopyJump:false,
maxBounds:[[-85,-180],[85,180]],
maxBoundsViscosity:1.0
})

L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{noWrap:true}
).addTo(map)

var layers=[]

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

    if(!selectedStation){
        alert("Selecione uma estação CETESB");
        return;
    }

    console.log(
        "selectedStation=",
        selectedStation
    );

    let cetesb=[];

    document
      .querySelectorAll(".cetesbGas:checked")
      .forEach(cb => cetesb.push(cb.value));

    console.log("cetesb=", cetesb);

    let sat=[];

    document
      .querySelectorAll(".satGas:checked")
      .forEach(cb => sat.push(cb.value));

    console.log("sat=", sat);

    let start =
      document.getElementById("startDate").value;

    let end =
      document.getElementById("endDate").value;

    let url =
      `/api/compare_series?station=${selectedStation.codigo}`;

    cetesb.forEach(g =>
        url += `&cetesb=${g}`
    );

    sat.forEach(g =>
        url += `&sat=${g}`
    );

    url += `&start=${start}`;
    url += `&end=${end}`;

    console.log("URL=", url);

    // let resp = await fetch(url);

    // let data = await resp.json();

    // console.log("RETORNO=", data);

    let resp = await fetch(url);

    let data = await resp.json();

    console.log(
    JSON.stringify(data, null, 2)
    );

    window.lastCompareData = data;

    console.log("RETORNO=", data);

    if(data.erro){

        alert(data.erro);
        return;
    }

    drawCompareChart(data);

}

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
async function loadAnos(){

let produto=document.getElementById("produto").value

let anos=await (await fetch("/api/anos/"+produto)).json()

let select=document.getElementById("ano")
select.innerHTML=""

anos.forEach(a=>{
let o=document.createElement("option")
o.value=a
o.text=a
select.add(o)
})

loadDatas()
}

// ---------------------
async function loadDatas(){

let produto=document.getElementById("produto").value
let ano=document.getElementById("ano").value

let datas=await (await fetch("/api/datas/"+produto+"/"+ano)).json()

let select=document.getElementById("data")
select.innerHTML=""

datas.forEach(d=>{
let o=document.createElement("option")
o.value=d
o.text=d
select.add(o)
})
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


function drawCompareChart(data)
{

    console.log("ENTROU NO GRÁFICO");

    console.log("DATES=", data.dates);

    console.log("SERIES=", data.series);

    // Verificação de valores do gráfico
    console.log("VERSAO NOVA 12345");
    data.series.forEach(s => {

        const validos =
            s.values.filter(v => v !== null);

        console.log(
            s.name,
            "MIN=", Math.min(...validos),
            "MAX=", Math.max(...validos)
        );
    });

    //console.log(JSON.stringify(data.series,null,2));
    data.series.forEach(s => {

        if (
            s.name.includes("AI") ||
            s.name.includes("CH4")
        )
        {
            console.log("========");
            console.log(s.name);
            console.log(s.values);
        }
    });

    
    let ctx =
        document
        .getElementById("pixelChart")
        .getContext("2d");

    console.log("CANVAS=", ctx);
        
    document.getElementById(
        "chartPanel"
    ).style.display="block";

    if(window.compareChart)
    {
        window.compareChart.destroy();
    }

    let datasets=[];

    data.series.forEach(s =>
    {
        datasets.push({
            label:s.name,
            data:s.values
        });
    });


    console.log(
        "Datasets:",
        datasets
    );

    console.log(
        "Dates:",
        data.dates
    );

    console.log("DATASETS=", datasets);

    window.compareChart =
        new Chart(ctx,{
            type:"line",
            data:{
                labels:data.dates,
                datasets:datasets
            }
        });
    
        console.log("CRIANDO CHART");

    }


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
async function getGeoTiff(produto,data){

let key=produto+"_"+data

if(geotiffCache[key]){
return geotiffCache[key]
}

let ano=data.substring(0,4)
let url="/geotiff/"+produto+"/"+ano+"/"+data

let response=await fetch(url)
let arrayBuffer=await response.arrayBuffer()
let georaster=await parseGeoraster(arrayBuffer)

geotiffCache[key]=georaster

return georaster
}

// ---------------------
async function addLayer(){

let produto=document.getElementById("produto").value
let data=document.getElementById("data").value

let nome=produto+" "+data

if(layers.find(l=>l.nome===nome)){
alert("Camada já carregada")
return
}

let cmap=await loadColormap(produto)
let georaster=await getGeoTiff(produto,data)

let layer=createRasterLayer(georaster,cmap)

layer.nome=nome
layer.cmap=cmap

layer.addTo(map)

layers.push(layer)

// createLegend(cmap,nome)
createLegend(cmap, nome, layer)
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

// pixelChart=new Chart(ctx,{
// type:"line",

timelineChart=new Chart(ctx,{
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

document.getElementById("pixelChart").style.display = "none";
document.getElementById("timelineChart").style.display = "block";

createPixelChart(values,cmap,produto)

// document.getElementById("chartPanel").style.display="block"
document.getElementById(
"chartPanel"
).style.display="block";
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


// function getCurrentChart()
// {
//     if(window.compareChart)
//         return window.compareChart;

//     if(pixelChart)
//         return pixelChart;

//     return null;
// }

function getCurrentChart()
{
    if(window.compareChart)
        return window.compareChart;

    if(timelineChart)
        return timelineChart;

    if(pixelChart)
        return pixelChart;

    return null;
}


function downloadChartPNG()
{
    let chart = getCurrentChart();

    if(!chart){
        alert("Nenhum gráfico disponível");
        return;
    }

    let url = chart.toBase64Image();

    let a = document.createElement("a");
    a.href = url;
    a.download = "grafico.png";
    a.click();
}

// ---------------------
function downloadChartJPG()
{
    // let canvas =
    //     document.getElementById("pixelChart");
    let canvas;

    if(document.getElementById("timelineChart").style.display !== "none")
    {
        canvas = document.getElementById("timelineChart");
    }
    else
    {
        canvas = document.getElementById("pixelChart");
    }    

    let tempCanvas =
        document.createElement("canvas");

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

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

    a.download =
        "grafico.jpg";

    a.click();
}



// function downloadChartJPG(){
// {
//     let chart = getCurrentChart();

//     if(!chart){
//         alert("Nenhum gráfico disponível");
//         return;
//     }

//     let url = chart.toBase64Image();

//     let a = document.createElement("a");
//     a.href = url;
//     a.download = "grafico.jpg";
//     a.click();
// }

// let canvas = document.getElementById("pixelChart")

// // cria canvas temporário com fundo branco
// let tempCanvas = document.createElement("canvas")
// tempCanvas.width = canvas.width
// tempCanvas.height = canvas.height

// let ctx = tempCanvas.getContext("2d")

// // fundo branco
// ctx.fillStyle = "#FFFFFF"
// ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

// // desenha o gráfico por cima
// ctx.drawImage(canvas, 0, 0)

// // exporta como JPG
// let url = tempCanvas.toDataURL("image/jpeg", 0.95)

// let a = document.createElement("a")
// a.href = url
// a.download = "serie_temporal.jpg"
// a.click()

// }

// ---------------------
function toggleTimeline(){

let panel = document.getElementById("timelinePanel")

if(panel.style.display === "none" || panel.style.display === ""){
panel.style.display = "block"
}else{
panel.style.display = "none"
}

map.invalidateSize()
}

// ---------------------
function downloadCSV()
{
    let chart = getCurrentChart();

    if(!chart){
        alert("Nenhum gráfico disponível");
        return;
    }

    let csv = "";

    if(window.lastCompareData)
    {
        csv += `Estação;${window.lastCompareData.station.codigo} - ${window.lastCompareData.station.nome}\n`;
        csv += `Período;${window.lastCompareData.start} a ${window.lastCompareData.end}\n\n`;
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
            {type:"text/csv;charset=utf-8;"}
        );

    let url =
        URL.createObjectURL(blob);

    let a =
        document.createElement("a");

    a.href = url;

    a.download =
        "comparacao_cetesb_satelite.csv";

    a.click();

    URL.revokeObjectURL(url);
}



// function downloadCSV(){
// {
//     let chart = getCurrentChart();

//     if(!chart){
//         alert("Nenhum gráfico disponível");
//         return;
//     }

//     let url = chart.toBase64Image();

//     let a = document.createElement("a");
//     a.href = url;
//     // a.download = "grafico.csv";
//     a.click();
// }


// let values = pixelChart.data.datasets[0].data

// // let csv="data,valor\n"

// let csv=`Lat: ${clickLat}, Lon: ${clickLon}\n`
// csv+="data,valor\n"

// for(let i=0;i<timelineDates.length;i++){
// csv+=timelineDates[i]+","+values[i]+"\n"
// }

// let blob=new Blob([csv],{type:"text/csv"})
// let url=URL.createObjectURL(blob)

// let a=document.createElement("a")
// a.href=url
// a.download="serie_temporal.csv"
// a.click()

// }

// ---------------------

function closeChart(){
document.getElementById("chartPanel").style.display="none"
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

// ---------------------
// DRAG
function dragElement(elmnt){

let pos1=0,pos2=0,pos3=0,pos4=0
let header=document.getElementById("chartHeader")

header.onmousedown=dragMouseDown

function dragMouseDown(e){
e.preventDefault()
pos3=e.clientX
pos4=e.clientY
document.onmouseup=closeDrag
document.onmousemove=drag
}

function drag(e){
e.preventDefault()
pos1=pos3-e.clientX
pos2=pos4-e.clientY
pos3=e.clientX
pos4=e.clientY
elmnt.style.top=(elmnt.offsetTop-pos2)+"px"
elmnt.style.left=(elmnt.offsetLeft-pos1)+"px"
}

function closeDrag(){
document.onmouseup=null
document.onmousemove=null
}
}


function formatDateBR(dateStr)
{
    let p = dateStr.split("-");

    return `${p[2]}/${p[1]}/${p[0]}`;
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


function drawCompareChart(data){
    
{
    console.log("ENTROU NO GRÁFICO");

    document.getElementById(
        "chartPanel"
    ).style.display = "block";

    const canvas =
        document.getElementById(
            "pixelChart"
        );

    if(window.compareChart)
    {
        window.compareChart.destroy();
    }

    let datasets=[];

    data.series.forEach(s =>
    {
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
                s.satellite ? [8,4] : [],

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




        // datasets.push({

        //     label: s.name,

        //     data: s.values,

        //     unit: s.unit || "",

        //     borderColor: cor,

        //     backgroundColor: cor,

        //     fill: false,

        //     tension: 0.2,

        //     borderWidth:
        //         s.satellite ? 2 : 1.5,

        //     borderDash:
        //         s.satellite ? [8,4] : [],

        //     pointRadius:
        //         s.satellite ? 6 : 3,

        //     pointHoverRadius:
        //         s.satellite ? 8 : 5,

        //     pointStyle: pointStyle,

        //     yAxisID:
        //         s.name.includes("CH4")
        //         ? "y2"
        //         : "y"
        // });
    });

    //
    // ORDENA A LEGENDA
    //
    datasets.sort((a,b)=>
    {
        let ia = LEGEND_ORDER.indexOf(a.label);
        let ib = LEGEND_ORDER.indexOf(b.label);

        if(ia === -1) ia = 999;
        if(ib === -1) ib = 999;

        return ia - ib;
    });

    console.log("ORDEM FINAL:");
    datasets.forEach(d => console.log(d.label));    

    document.getElementById("pixelChart").style.display = "block";
    document.getElementById("timelineChart").style.display = "none";

    window.compareChart =
        new Chart(canvas,{
            type:"line",
            data:{
                labels:data.dates,
                datasets:datasets
            },

            // options:{

            //     responsive:true,

            //     maintainAspectRatio:false,

            //     plugins: {

            //         title: {
            //             display: true,
            //             text: [
            //                 "Qualidade do Ar - Médias Diárias",
            //                 `Estação: ${data.station.codigo} - ${data.station.nome}`,
            //                 `Período: ${formatDateBR(data.start)} a ${formatDateBR(data.end)}`
            //             ],
            //             font: {
            //                 size: 16,
            //                 weight: "bold"
            //             },
            //             padding: {
            //                 top: 10,
            //                 bottom: 20
            //             }
            //         },

            //         legend: {
            //             position: "top"
            //         }
            //     }
            // }                

            options:{

                responsive:true,

                maintainAspectRatio:false,

                interaction:{
                    mode:"index",
                    intersect:false
                },

                plugins:{

                    title:{
                        display:true,
                        text:[
                            "Qualidade do Ar - Médias Diárias",
                            `Estação: ${data.station.codigo} - ${data.station.nome}`,
                            `Período: ${formatDateBR(data.start)} a ${formatDateBR(data.end)}`
                        ]
                    },

                    legend:{
                        position:"top"
                    },

                    // // Data do gráfico (parte inferior) em formato brasileiro
                    // tooltip:{
                    //     callbacks:{

                    //         title:function(items){

                    //             let d = items[0].label;

                    //             return formatDateBR(d);
                    //         },

                    //         label:function(context){

                    //             let ds = context.dataset;

                    //             let valor = context.parsed.y;

                    //             let unidade = ds.unit || "";

                    //             return `${ds.label}: ${valor.toFixed(2)} ${unidade}`;
                    //         }
                    //     }
                    // }


                    tooltip:{
                        callbacks:{

                            title:function(items){

                                return formatDateBR(
                                    items[0].label
                                );
                            },

                            label:function(context){

                                let ds = context.dataset;

                                let valor = context.parsed.y;

                                if(valor == null)
                                    return "";

                                let unidade =
                                    ds.unit || "";

                                return `${ds.label}: ${valor.toFixed(2)} ${unidade}`;
                            }
                        }
                    }

                }
            }            


        });
    }
}    

// ---------------------
// RESIZE OBSERVER
const resizeObserver =
new ResizeObserver(() =>
{
    let chart =
        getCurrentChart();

    if(chart)
        chart.resize();
});

// const resizeObserver = new ResizeObserver(() => {
// if(pixelChart){
// pixelChart.resize()
// }
// })

// ---------------------
// document.getElementById("produto").onchange=loadAnos
// document.getElementById("ano").onchange=loadDatas
// document.getElementById("timeSlider").oninput=updateTimeline

const produto = document.getElementById("produto");
const ano = document.getElementById("ano");
const timeSlider = document.getElementById("timeSlider");

if(produto) produto.onchange = loadAnos;
if(ano) ano.onchange = loadDatas;
if(timeSlider) timeSlider.oninput = updateTimeline;



dragElement(document.getElementById("chartPanel"))
resizeObserver.observe(document.getElementById("chartPanel"))

init()

