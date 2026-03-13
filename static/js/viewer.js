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

layer.addTo(map)

layer.redraw()

layers.push(layer)

let legend = createLegend(cmap,nome)

createLayerControl(nome,layer,legend)

map.invalidateSize()

// map.fitBounds(layer.getBounds(), {animate:false})

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

init()