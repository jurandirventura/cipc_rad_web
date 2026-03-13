var map = L.map('map',{
center:[-15,-55],
zoom:4,
worldCopyJump:false,
maxBounds:[[-90,-180],[90,180]]
})

L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{noWrap:true}
).addTo(map)

var layers=[]

// Timeline
var timelineDates=[]
var timelineLayer=null

var timelineInterval = null

// Cache Global
var geotiffCache={}

// Para área de gráfico
var pixelChart=null
var clickLat=null
var clickLon=null

// -----------------
async function init(){

let produtos=await (await fetch("/api/produtos")).json()

let p=document.getElementById("produto")

produtos.forEach(x=>{

let o=document.createElement("option")

o.value=x
o.text=x

p.add(o)

})

loadAnos()

}

// -----------------
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

// -----------------

async function loadColormap(product){

  const response =
    await fetch(`/api/colormap/${product}`)

  const cmap = await response.json()

  return cmap
}

//------------------
function createLegend(cmap,nome){

let div = document.createElement("div")

div.className="legendItem"

const colors = cmap.colors.join(", ")

div.innerHTML = `

<b>${nome}</b>

<div style="
width:260px;
height:15px;
background: linear-gradient(to right, ${colors});
border:1px solid black;
"></div>

<div style="
display:flex;
justify-content:space-between;
font-size:12px">
<span>${cmap.vmin}</span>
<span>${cmap.vmax}</span>
</div>

<div style="
font-size:11px;
text-align:right;
color:#333">
${cmap.unit || ""}
</div>

`

document.getElementById("legendPanel").appendChild(div)

return div
}

//------------------

function getPixelValue(layer,lat,lng){

let r = layer.georaster

let xmin = r.xmin
let ymax = r.ymax
let resx = r.pixelWidth
let resy = r.pixelHeight

let col = Math.floor((lng - xmin)/resx)
let row = Math.floor((ymax - lat)/resy)

if(
row < 0 || col < 0 ||
row >= r.height ||
col >= r.width
){
return null
}

return r.values[0][row][col]

}


// ----------------- Função stop
function stopTimeline(){

if(timelineInterval){
clearInterval(timelineInterval)
timelineInterval=null
}

}

// Função Gráfico

function drawChart(values){

const ctx=document.getElementById("chart")

new Chart(ctx,{
type:"line",
data:{
labels:timelineDates,
datasets:[{
label:"Valor",
data:values
}]
}
})

}


// ----------------- Download
function downloadCSV(){

let csv="data,valor\n"

for(let i=0;i<timelineDates.length;i++){

csv+=timelineDates[i]+","+timelineValues[i]+"\n"

}

let blob=new Blob([csv],{type:"text/csv"})

let url=URL.createObjectURL(blob)

let a=document.createElement("a")

a.href=url
a.download="serie_temporal.csv"

a.click()

}

//------------------ Animação automática do timeline

async function playTimeline(){

let speed=document.getElementById("speedSlider").value

let slider=document.getElementById("timeSlider")

timelineInterval=setInterval(async function(){

let i=parseInt(slider.value)

if(i>=timelineDates.length-1){
clearInterval(timelineInterval)
return
}

slider.value=i+1

await updateTimeline()

},speed)

}

// ----------------- Cria gráfico
function createPixelChart(values){

let ctx=document.getElementById("pixelChart").getContext("2d")

if(pixelChart){
pixelChart.destroy()
}

pixelChart=new Chart(ctx,{

type:"line",

data:{

labels:timelineDates,

datasets:[{

label:"Pixel value",

data:values,

borderWidth:2,

fill:false

}]

},

options:{

responsive:true,

plugins:{
legend:{display:true}
},

scales:{
x:{display:true},
y:{display:true}
}

}

})

}

//------------------ Recolhe botão Timeline
function toggleTimeline(){

let panel=document.getElementById("timelinePanel")

if(panel.style.display==="none"){

panel.style.display="block"

}else{

panel.style.display="none"

}

map.invalidateSize()

}

//------------------


async function loadProduct(product){

   const cmap = await loadColormap(product)

   createLegend(cmap)

}

//------------------

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

// -----------------

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

let datas=await (await fetch(
"/api/datas_interval/"+produto+"/"+start+"/"+end
)).json()

if(datas.length===0){
   alert("Nenhuma data encontrada")
   return
}

timelineDates=datas

let slider=document.getElementById("timeSlider")

slider.max=datas.length-1
slider.value=0

updateTimeline()

}

// ----------------- Move timeline

async function updateTimeline(){

if(timelineDates.length === 0){
   console.log("Timeline vazia")
   return
}

let produto=document.getElementById("produto").value
let index=parseInt(document.getElementById("timeSlider").value)

let data=timelineDates[index]

if(!data){
   console.log("Data inválida:",index)
   return
}

let d = data.substring(0,4)+"-"+data.substring(4,6)+"-"+data.substring(6,8)

document.getElementById("timeLabel").innerHTML=d

if(timelineLayer){
   map.removeLayer(timelineLayer)
}

timelineLayer=await loadGeoTiff(produto,data)

}

// ----------------- Carrega GeoTIFF no Timeline

async function loadGeoTiff(produto,data){

let key=produto+"_"+data

if(geotiffCache[key]){

console.log("Cache hit:",key)

geotiffCache[key].addTo(map)

return geotiffCache[key]

}

let ano=data.substring(0,4)

let url="/geotiff/"+produto+"/"+ano+"/"+data

let response=await fetch(url)

let arrayBuffer=await response.arrayBuffer()

let georaster=await parseGeoraster(arrayBuffer)

let cmap=await loadColormap(produto)

let layer=new GeoRasterLayer({

georaster:georaster,
opacity:0.7,
resolution:128,
wrapX:false,

pixelValuesToColorFn:function(pixelValues){

let v=pixelValues[0]

if(v===-9999 || v===undefined) return null

let ratio=(v-cmap.vmin)/(cmap.vmax-cmap.vmin)

ratio=Math.max(0,Math.min(1,ratio))

return chroma.scale(cmap.colors)(ratio).hex()

}

})

layer.addTo(map)

geotiffCache[key]=layer

return layer

}


// -----------------
async function addLayer(){

let produto=document.getElementById("produto").value
let ano=document.getElementById("ano").value
let data=document.getElementById("data").value

let nome = produto+" "+data

if(layers.find(l => l.nome === nome)){
   alert("Camada já carregada")
   return
}

const cmap = await loadColormap(produto)

let url="/geotiff/"+produto+"/"+ano+"/"+data

let response=await fetch(url)

let arrayBuffer=await response.arrayBuffer()

let georaster=await parseGeoraster(arrayBuffer)

let layer=new GeoRasterLayer({

georaster:georaster,
opacity:0.7,
resolution:64,
wrapX:false,

pixelValuesToColorFn:function(pixelValues){

let v=pixelValues[0]

if(v===-9999 || v===undefined) return null

let ratio=(v-cmap.vmin)/(cmap.vmax-cmap.vmin)

ratio=Math.max(0,Math.min(1,ratio))

return chroma.scale(cmap.colors)(ratio).hex()

}

})

layer.nome = nome

layer.georaster = georaster

layer.addTo(map)

layer.cmap = cmap

layer.redraw()

layers.push(layer)

let legend = createLegend(cmap,nome)

createLayerControl(nome,layer,legend)

map.invalidateSize()

// map.fitBounds(layer.getBounds(), {animate:false})

}

// ----------------- Cálculo da série temporal

async function buildPixelSeries(){

let produto=document.getElementById("produto").value

let values=[]

for(let data of timelineDates){

let ano=data.substring(0,4)

let url="/geotiff/"+produto+"/"+ano+"/"+data

let response=await fetch(url)

let arrayBuffer=await response.arrayBuffer()

let georaster=await parseGeoraster(arrayBuffer)

let value = geoblaze.identify(georaster,[clickLon,clickLat])

values.push(value ? value[0] : null)

}

createPixelChart(values)

}

// -----------------
function createLayerControl(nome,layer,legend){

let div=document.createElement("div")

div.className="layerItem"

div.innerHTML=`
<b>${nome}</b><br>
<input type="range" min="0" max="1" step="0.1" value="0.7">
<button>Remover</button>
`

let slider=div.querySelector("input")

slider.oninput=function(){
layer.setOpacity(this.value)
}

let btn=div.querySelector("button")

btn.onclick=function(){

map.removeLayer(layer)

layers = layers.filter(l => l !== layer)

div.remove()

legend.remove()

}

document.getElementById("layersPanel").appendChild(div)

}

document.getElementById("produto").onchange=loadAnos
document.getElementById("ano").onchange=loadDatas

map.on("mousemove",function(e){

let lat=e.latlng.lat
let lng=e.latlng.lng

let txt=`Lat: ${lat.toFixed(3)} Lon: ${lng.toFixed(3)}<br>`

layers.forEach(layer=>{

let v=getPixelValue(layer,lat,lng)

if(v!==null && v!==-9999){

txt+=`${layer.nome}: ${v} ${layer.cmap?.unit || ""}<br>`

}

})

document.getElementById("pixelValues").innerHTML=txt

})

map.on("click",async function(e){

let lat=e.latlng.lat
let lon=e.latlng.lng

let values=[]

for(let layer of layers){

let val=layer.getValueAtLatLng(lat,lon)

values.push(val)

}

drawChart(values)

})

document.getElementById("timeSlider").oninput=updateTimeline

init()