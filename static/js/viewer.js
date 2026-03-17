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

// ---------------------
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
const response = await fetch(`/api/colormap/${product}`)
return await response.json()
}

// ---------------------
function createLegend(cmap,nome){

let div=document.createElement("div")
div.className="legendItem"

const colors=cmap.colors.join(", ")

div.innerHTML=`
<b>${nome}</b>

<div style="width:260px;height:15px;
background:linear-gradient(to right, ${colors});
border:1px solid black;"></div>

<div style="display:flex;justify-content:space-between;font-size:12px">
<span>${cmap.vmin}</span>
<span>${cmap.vmax}</span>
</div>

<div style="font-size:11px;text-align:right;">
${cmap.unit || ""}
</div>
`

document.getElementById("legendPanel").appendChild(div)
return div
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
function createRasterLayer(georaster,cmap){

return new GeoRasterLayer({

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
async function updateTimeline(){

if(timelineDates.length===0) return

let produto=document.getElementById("produto").value
let index=parseInt(document.getElementById("timeSlider").value)
let data=timelineDates[index]

document.getElementById("timeLabel").innerHTML=data

if(timelineLayer){
map.removeLayer(timelineLayer)
}

let georaster=await getGeoTiff(produto,data)
let cmap=await loadColormap(produto)

timelineLayer=createRasterLayer(georaster,cmap)
timelineLayer.addTo(map)
}

// ---------------------
function createPixelChart(values, cmap, produto){

let ctx=document.getElementById("pixelChart").getContext("2d")

if(pixelChart){
pixelChart.destroy()
}

let title = cmap.title || produto
let shortName = cmap.short_name || produto
let unit = cmap.unit || ""
let description = cmap.description || ""

pixelChart=new Chart(ctx,{
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

createPixelChart(values,cmap,produto)

document.getElementById("chartPanel").style.display="block"
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

function downloadChartPNG(){

if(!pixelChart){
alert("Nenhum gráfico disponível")
return
}

let url = pixelChart.toBase64Image()

let a = document.createElement("a")
a.href = url
a.download = "serie_temporal.png"
a.click()

}

// ---------------------

function downloadChartJPG(){

if(!pixelChart){
alert("Nenhum gráfico disponível")
return
}

let canvas = document.getElementById("pixelChart")

// cria canvas temporário com fundo branco
let tempCanvas = document.createElement("canvas")
tempCanvas.width = canvas.width
tempCanvas.height = canvas.height

let ctx = tempCanvas.getContext("2d")

// fundo branco
ctx.fillStyle = "#FFFFFF"
ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

// desenha o gráfico por cima
ctx.drawImage(canvas, 0, 0)

// exporta como JPG
let url = tempCanvas.toDataURL("image/jpeg", 0.95)

let a = document.createElement("a")
a.href = url
a.download = "serie_temporal.jpg"
a.click()

}

// ---------------------

function downloadCSV(){

if(!pixelChart){
alert("Nenhum gráfico disponível")
return
}

let values = pixelChart.data.datasets[0].data

let csv="data,valor\n"

for(let i=0;i<timelineDates.length;i++){
csv+=timelineDates[i]+","+values[i]+"\n"
}

let blob=new Blob([csv],{type:"text/csv"})
let url=URL.createObjectURL(blob)

let a=document.createElement("a")
a.href=url
a.download="serie_temporal.csv"
a.click()

}

// ---------------------

function closeChart(){
document.getElementById("chartPanel").style.display="none"
}


// ---------------------
map.on("click",async function(e){

clickLat=e.latlng.lat
clickLon=e.latlng.lng

await buildPixelSeries()

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

// ---------------------
// RESIZE OBSERVER
const resizeObserver = new ResizeObserver(() => {
if(pixelChart){
pixelChart.resize()
}
})

// ---------------------
document.getElementById("produto").onchange=loadAnos
document.getElementById("ano").onchange=loadDatas
document.getElementById("timeSlider").oninput=updateTimeline

dragElement(document.getElementById("chartPanel"))
resizeObserver.observe(document.getElementById("chartPanel"))

init()




// #########################################################OLD
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

// var layers=[]

// // timeline
// var timelineDates=[]
// var timelineLayer=null
// var timelineInterval=null

// // cache global
// var geotiffCache={}

// // pixel chart
// var pixelChart=null
// var clickLat=null
// var clickLon=null

// // ---------------------
// async function init(){

// let produtos=await (await fetch("/api/produtos")).json()

// let p=document.getElementById("produto")

// produtos.forEach(x=>{
// let o=document.createElement("option")
// o.value=x
// o.text=x
// p.add(o)
// })

// loadAnos()
// }

// // ---------------------
// async function loadAnos(){

// let produto=document.getElementById("produto").value

// let anos=await (await fetch("/api/anos/"+produto)).json()

// let select=document.getElementById("ano")

// select.innerHTML=""

// anos.forEach(a=>{
// let o=document.createElement("option")
// o.value=a
// o.text=a
// select.add(o)
// })

// loadDatas()
// }

// // ---------------------
// async function loadDatas(){

// let produto=document.getElementById("produto").value
// let ano=document.getElementById("ano").value

// let datas=await (await fetch("/api/datas/"+produto+"/"+ano)).json()

// let select=document.getElementById("data")
// select.innerHTML=""

// datas.forEach(d=>{
// let o=document.createElement("option")
// o.value=d
// o.text=d
// select.add(o)
// })
// }

// // ---------------------
// async function loadColormap(product){

// const response =
// await fetch(`/api/colormap/${product}`)

// return await response.json()
// }

// // ---------------------
// function createLegend(cmap,nome){

// let div=document.createElement("div")
// div.className="legendItem"

// const colors=cmap.colors.join(", ")

// div.innerHTML=`

// <b>${nome}</b>

// <div style="
// width:260px;
// height:15px;
// background:linear-gradient(to right, ${colors});
// border:1px solid black;">
// </div>

// <div style="
// display:flex;
// justify-content:space-between;
// font-size:12px">
// <span>${cmap.vmin}</span>
// <span>${cmap.vmax}</span>
// </div>

// <div style="font-size:11px;text-align:right;">
// ${cmap.unit || ""}
// </div>
// `

// document.getElementById("legendPanel").appendChild(div)

// return div
// }

// // ---------------------
// // cache inteligente
// async function getGeoTiff(produto,data){

// let key=produto+"_"+data

// if(geotiffCache[key]){
// return geotiffCache[key]
// }

// let ano=data.substring(0,4)

// let url="/geotiff/"+produto+"/"+ano+"/"+data

// let response=await fetch(url)

// let arrayBuffer=await response.arrayBuffer()

// let georaster=await parseGeoraster(arrayBuffer)

// geotiffCache[key]=georaster

// return georaster
// }

// // ---------------------
// function createRasterLayer(georaster,cmap){

// return new GeoRasterLayer({

// georaster:georaster,
// opacity:0.7,
// resolution:128,
// wrapX:false,

// pixelValuesToColorFn:function(pixelValues){

// let v=pixelValues[0]

// if(v===-9999 || v===undefined) return null

// let ratio=(v-cmap.vmin)/(cmap.vmax-cmap.vmin)

// ratio=Math.max(0,Math.min(1,ratio))

// return chroma.scale(cmap.colors)(ratio).hex()

// }

// })
// }

// // ---------------------
// async function preloadNext(produto,index){

// let next=index+1

// if(next>=timelineDates.length) return

// let data=timelineDates[next]

// await getGeoTiff(produto,data)
// }

// // ---------------------
// async function loadTimeline(){

// let produto=document.getElementById("produto").value

// let start=document.getElementById("startDate").value
// let end=document.getElementById("endDate").value

// if(!start || !end){
// alert("Selecione data inicial e final")
// return
// }

// start=start.replaceAll("-","")
// end=end.replaceAll("-","")

// timelineDates=await (await fetch(
// "/api/datas_interval/"+produto+"/"+start+"/"+end
// )).json()

// if(timelineDates.length===0){
// alert("Nenhuma data encontrada")
// return
// }

// let slider=document.getElementById("timeSlider")

// slider.max=timelineDates.length-1
// slider.value=0

// updateTimeline()
// }

// // ---------------------
// async function updateTimeline(){

// if(timelineDates.length === 0) return

// let produto=document.getElementById("produto").value

// let index=parseInt(
// document.getElementById("timeSlider").value
// )

// let data=timelineDates[index]

// let d=data.substring(0,4)+"-"+data.substring(4,6)+"-"+data.substring(6,8)

// document.getElementById("timeLabel").innerHTML=d

// // remove camada antiga
// if(timelineLayer){
// map.removeLayer(timelineLayer)
// timelineLayer=null
// }

// // carrega raster
// let georaster=await getGeoTiff(produto,data)

// let cmap=await loadColormap(produto)

// // cria nova layer
// timelineLayer=createRasterLayer(georaster,cmap)

// // adiciona no mapa
// timelineLayer.addTo(map)

// // força redraw
// timelineLayer.redraw()

// // pré-carrega próxima imagem
// await preloadNext(produto,index)

// }

// // ---------------------
// function playTimeline(){

// stopTimeline()

// let speed=document.getElementById("speedSlider").value

// let slider=document.getElementById("timeSlider")

// timelineInterval=setInterval(async function(){

// let i=parseInt(slider.value)

// if(i>=timelineDates.length-1){
// stopTimeline()
// return
// }

// slider.value=i+1

// await updateTimeline()

// },speed)

// }

// // ---------------------
// function stopTimeline(){

// if(timelineInterval){
// clearInterval(timelineInterval)
// timelineInterval=null
// }

// }

// // ---------------------

// function toggleTimeline(){

// let panel = document.getElementById("timelinePanel")

// if(panel.style.display === "none" || panel.style.display === ""){

// panel.style.display = "block"

// }else{

// panel.style.display = "none"

// }

// map.invalidateSize()

// }


// // ---------------------
// async function addLayer(){

// let produto=document.getElementById("produto").value
// let ano=document.getElementById("ano").value
// let data=document.getElementById("data").value

// let nome=produto+" "+data

// if(layers.find(l=>l.nome===nome)){
// alert("Camada já carregada")
// return
// }

// let cmap=await loadColormap(produto)

// let georaster=await getGeoTiff(produto,data)

// let layer=createRasterLayer(georaster,cmap)

// layer.nome=nome
// layer.cmap=cmap
// layer.georaster=georaster

// layer.addTo(map)

// layers.push(layer)

// let legend=createLegend(cmap,nome)

// createLayerControl(nome,layer,legend)

// }

// // ---------------------
// function createLayerControl(nome,layer,legend){

// let div=document.createElement("div")

// div.className="layerItem"

// div.innerHTML=`
// <b>${nome}</b><br>
// <input type="range" min="0" max="1" step="0.1" value="0.7">
// <button>Remover</button>
// `

// let slider=div.querySelector("input")

// slider.oninput=function(){
// layer.setOpacity(this.value)
// }

// let btn=div.querySelector("button")

// btn.onclick=function(){

// map.removeLayer(layer)

// layers=layers.filter(l=>l!==layer)

// div.remove()
// legend.remove()

// }

// document.getElementById("layersPanel").appendChild(div)

// }

// // ---------------------

// // function createPixelChart(values, cmap, produto){

// // let ctx=document.getElementById("pixelChart").getContext("2d")

// // if(pixelChart){
// // pixelChart.destroy()
// // }

// // pixelChart=new Chart(ctx,{
// // type:"line",

// // data:{
// // labels: timelineDates.map(d =>
// // d.substring(0,4)+"-"+d.substring(4,6)+"-"+d.substring(6,8)
// // ),

// // datasets:[{
// // label: produto,
// // data:values,
// // borderWidth:2,
// // fill:false
// // }]
// // },

// // options:{

// // plugins:{
// // title:{
// // display:true,
// // text: produto
// // }
// // },

// // scales:{

// // y:{
// // min:cmap.vmin,
// // max:cmap.vmax,
// // title:{
// // display:true,
// // text:cmap.unit || ""
// // }
// // }

// // }

// // }

// // })

// // }


// function createPixelChart(values, cmap, produto){

// let ctx=document.getElementById("pixelChart").getContext("2d")

// if(pixelChart){
// pixelChart.destroy()
// }

// // metadados científicos
// let title = cmap.title || produto
// let shortName = cmap.short_name || produto
// let unit = cmap.unit || ""
// let description = cmap.description || ""

// pixelChart=new Chart(ctx,{
// type:"line",

// data:{
// labels: timelineDates.map(d =>
// d.substring(0,4)+"-"+d.substring(4,6)+"-"+d.substring(6,8)
// ),

// datasets:[{
// label: shortName,
// data:values,
// borderWidth:2,
// fill:false,
// pointRadius:3,
// tension:0.1
// }]
// },

// options:{

// // responsive:true,
// options:{
//   responsive:true,
//   maintainAspectRatio:false, // ESSENCIAL para resize funcionar


// plugins:{

// title:{
// display:true,
// text:title
// },

// tooltip:{
// callbacks:{
// label:function(context){
// let v=context.parsed.y
// if(v===null) return "No data"
// return v+" "+unit
// },
// afterBody:function(){
// return description
// }
// }
// }

// },

// scales:{

// x:{
// title:{
// display:true,
// text:"Date"
// }
// },

// y:{
// min:cmap.vmin,
// max:cmap.vmax,

// title:{
// display:true,
// text: unit ? `Value (${unit})` : "Value"
// }
// }

// }

// }

// })

// }



// // ---------------------

// async function buildPixelSeries(){

// if(timelineDates.length===0){

// alert("Carregue a timeline primeiro")

// return

// }

// let produto=document.getElementById("produto").value

// let values=[]

// for(let data of timelineDates){

// let georaster=await getGeoTiff(produto,data)

// let v=getPixelValue(
// {georaster:georaster},
// clickLat,
// clickLon
// )

// values.push(v)

// }

// // createPixelChart(values)

// let cmap = await loadColormap(produto)

// createPixelChart(values, cmap, produto)

// document.getElementById("chartPanel").style.display="block"

// }


// // ---------------------
// function getPixelValue(layer,lat,lng){

// let r=layer.georaster

// let xmin=r.xmin
// let ymax=r.ymax
// let resx=r.pixelWidth
// let resy=r.pixelHeight

// let col=Math.floor((lng-xmin)/resx)
// let row=Math.floor((ymax-lat)/resy)

// if(row<0 || col<0 ||
// row>=r.height ||
// col>=r.width){
// return null
// }

// return r.values[0][row][col]
// }

// // --------------------

// function downloadCSV(){

// if(!pixelChart){
// alert("Nenhum gráfico disponível")
// return
// }

// let values = pixelChart.data.datasets[0].data

// let csv="data,valor\n"

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

// // ---------------------

// function closeChart(){

// document.getElementById("chartPanel").style.display="none"

// }

// // ---------------------
// map.on("mousemove",function(e){

// let lat=e.latlng.lat
// let lng=e.latlng.lng

// let txt=`Lat: ${lat.toFixed(3)} Lon: ${lng.toFixed(3)}<br>`

// layers.forEach(layer=>{

// let v=getPixelValue(layer,lat,lng)

// if(v!==null && v!==-9999){

// txt+=`${layer.nome}: ${v} ${layer.cmap?.unit || ""}<br>`

// }

// })

// document.getElementById("pixelValues").innerHTML=txt

// })

// // ---------------------
// map.on("click",async function(e){

// clickLat=e.latlng.lat
// clickLon=e.latlng.lng

// await buildPixelSeries()

// })

// // ---------------------
// document.getElementById("produto").onchange=loadAnos
// document.getElementById("ano").onchange=loadDatas
// document.getElementById("timeSlider").oninput=updateTimeline

// dragElement(document.getElementById("chartPanel"))
// function dragElement(elmnt) {

// let pos1=0,pos2=0,pos3=0,pos4=0

// let header=document.getElementById("chartHeader")

// if(header){
// header.onmousedown=dragMouseDown
// }else{
// elmnt.onmousedown=dragMouseDown
// }

// function dragMouseDown(e){

// e.preventDefault()

// pos3=e.clientX
// pos4=e.clientY

// document.onmouseup=closeDragElement
// document.onmousemove=elementDrag
// }

// function elementDrag(e){

// e.preventDefault()

// pos1=pos3-e.clientX
// pos2=pos4-e.clientY

// pos3=e.clientX
// pos4=e.clientY

// elmnt.style.top=(elmnt.offsetTop-pos2)+"px"
// elmnt.style.left=(elmnt.offsetLeft-pos1)+"px"
// }

// function closeDragElement(){
// document.onmouseup=null
// document.onmousemove=null
// }

// }

// const chartPanel = document.getElementById("chartPanel")

// const resizeObserver = new ResizeObserver(() => {
//   if(pixelChart){
//     pixelChart.resize()
//   }
// })

// resizeObserver.observe(chartPanel)


// init()

