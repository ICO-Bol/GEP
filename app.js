/* ============================================================
   GEOVISOR: Lógica principal con comentarios detallados
   - Inicializa mapa y mapas base (OSM/Google)
   - Carga automática de capas de puntos desde Data/
   - Control de capas (habilitar/desactivar), leyenda con colores aleatorios
   - Filtros por atributos: Municipio, Comunidad, Beneficiar
   - Medición con Leaflet.draw y añadir marcador manual
   ============================================================ */

/* ---------------------------
   Estado global del geovisor
   --------------------------- */
const state = {
  map: null,                 // referencia al mapa Leaflet
  baseLayers: {},            // mapas base disponibles
  overlays: {},              // capas de puntos (nombre -> { layer, color })
  drawnItems: null,          // grupo para dibujos/mediciones
  addingMarker: false,       // modo 'añadir marcador' activo/inactivo
  filterText: '',            // texto de filtro
  filterField: 'Beneficiar'  // atributo seleccionado para filtrar
};

/* -----------------------------------------
   Colores fijos por capa
   ----------------------------------------- */
const layerColors = {
  'Riego': '#0000FF',          // Azul
  'REPANA': '#FF0000',         // Rojo
  'Reforestación': '#00FF00',  // Verde claro
  'Frutal': '#FF69B4',         // Rosado
  'Canapas': '#FFA500',        // Naranja
  'Apis': '#FFFF00',           // Amarillo
  'Gallinero': '#D3D3D3',      // Gris claro
  'Huertos': '#9370DB',        // Morado claro
};

/* ---------------------------
   Inicialización del mapa
   - Crea el mapa, añade mapas base y controles
   --------------------------- */
function initMap() {
  // Centro aproximado en la provincia M. M. Caballero (ajústalo si lo deseas)
  const center = [-18.489, -64.106];

  // Crear mapa con vista inicial y límites razonables
  state.map = L.map('map', {
    center,
    zoom: 7,
    minZoom: 2,
    worldCopyJump: true
  });

  // Mapas base: OSM, Google Satélite, Google Topográfico
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(state.map);

  const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    subdomains: ['mt0','mt1','mt2','mt3'],
    maxZoom: 20,
    attribution: '© Google'
  });

  const googleTopo = L.tileLayer('http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    subdomains: ['mt0','mt1','mt2','mt3'],
    maxZoom: 20,
    attribution: '© Google'
  });

  // Guardamos referencias a los mapas base
  state.baseLayers = {
    'OpenStreetMap': osm,
    'Google Satélite': googleSat,
    'Google Topográfico': googleTopo
  };

  // Control de capas (solo bases aquí; overlays se agregan luego)
  L.control.layers(state.baseLayers, {}, { collapsed: true }).addTo(state.map);

  // Escala métrica
  L.control.scale({ metric: true, imperial: false }).addTo(state.map);

  // Grupo para dibujos/mediciones
  state.drawnItems = new L.FeatureGroup();
  state.map.addLayer(state.drawnItems);

  // Configurar Leaflet.draw para medición (polilíneas) y edición
  const drawControl = new L.Control.Draw({
    draw: {
      polygon: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
      marker: false,      // marcador manual lo manejamos con nuestro botón
      polyline: {         // polilínea para medir distancias
        shapeOptions: { color: '#38bdf8', weight: 3 } }
    },
    edit: {
      featureGroup: state.drawnItems }
  });
  state.map.addControl(drawControl);

  // Evento: al terminar un dibujo (p. ej., polilínea), calcular distancia total
  state.map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    state.drawnItems.addLayer(layer);
    if (layer instanceof L.Polyline) {
      const dist = measurePolyline(layer);
      setInfo(`Medición: ${dist.toFixed(2)} km.`);
    }
  });

  // Evento de clic para añadir marcador cuando el modo está activo
  state.map.on('click', (e) => {
    if (!state.addingMarker) return;
    const m = createCustomMarker(e.latlng, { title: 'Marcador' });
    m.addTo(state.map);
    state.addingMarker = false;
    setInfo(`Marcador añadido en ${formatLatLng(e.latlng)}.`);
  });
}

/* -----------------------------------------
   Carga automática de capas desde Data/
   - Convierte cada GeoJSON en L.GeoJSON
   - Aplica icono circular con color aleatorio
   - Popups con atributos clave
   - Registra overlays y construye leyenda
   ----------------------------------------- */
function loadLayers() {
  // Mapeo de nombre visible -> variable global (window) definida por los scripts de Data/
  const sources = {
    'Riego': window.riegoGeoJSON,
    'REPANA': window.repanaGeoJSON,
    'Reforestación': window.reforestacionGeoJSON,
    'Frutal': window.frutalGeoJSON,
    'Canapas': window.canapasGeoJSON,
    'Apis': window.apisGeoJSON,
    'Gallinero': window.gallineroGeoJSON,
	'Huertos': window.huertosGeoJSON
  };

  // Crear cada overlay con color aleatorio de alto contraste
  Object.entries(sources).forEach(([name, geojson]) => {
    if (!geojson) return; // si falta el archivo, se omite

    const color = layerColors[name] || '#cccccc';

    const layer = L.geoJSON(geojson, {
      // Convertimos cada punto en un marcador con icono circular coloreado
      pointToLayer: (feature, latlng) => {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<span style="display:inline-block;width:14px;height:14px;background:${color};border-radius:50%;border:2px solid #000;"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        return L.marker(latlng, { icon });
      },
      // Popups con atributos clave; se muestran todos los properties para transparencia
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const title = p.Comunidad || p.Beneficiar || p.Municipio || name;
		
        let html = `
          <strong>${title}</strong><br/>
          ${Object.keys(p).map(k => {
            if (k === 'Foto') return '';
            return `<div><em>${k}</em>: ${p[k]}</div>`;
          }).join('')}
        `;

        // Si existe campo Foto, añadir imagen
        if (p.Foto) {
           html += `<div><img src="${p.Foto}" alt="Foto de inversión" style="max-width:200px; margin-top:5px; border:1px solid #ccc"/></div>`;
        }

        layer.bindPopup(html);
        layer.on('click', () => setInfo(`${name} • ${title}`));
      },
      // Filtro inicial: si hay texto en filtro, se aplica sobre el atributo seleccionado
      filter: (feature) => {
        if (!state.filterText) return true;
        const props = feature.properties || {};
        const val = props[state.filterField];
        if (val === undefined || val === null) return false;
        return val.toString().toLowerCase().includes(state.filterText.toLowerCase());
      }
    });

    // Guardamos overlay y su color para leyenda
    state.overlays[name] = { layer, color };

    // Añadimos al mapa por defecto
    layer.addTo(state.map);
  });

  // Construir controles de la UI (sidebar) y leyenda
  renderLayerList();
  renderLegend();

  // Ajustar vista a todas las capas cargadas
  fitToAllLayers();
}

/* -----------------------------------------
   Sidebar: control de capas
   - Toggle de visibilidad (checkbox)
   - Zoom a capa
   - Descargar SHP desde carpeta local (/shp/)
   ----------------------------------------- */
function renderLayerList() {
  const container = document.getElementById('layerList');
  container.innerHTML = '';

  // Cuadro de descripción del geovisor 
  const description = document.createElement('div'); 
  description.className = 'layer-description'; 
  description.innerHTML = `
    <p><strong>Descripción del geovisor</strong></p>
    <p>Este visor muestra las ubicaciones de las inversiones productivas y ambientales realizadas en la provincia M. M. Caballero.
	Cada capa representa un tipo de inversión específica y se visualiza con un color definido en la leyenda.
	Para su descarga individual en formato shp presionar "SHP".</p>
  `; 
  container.appendChild(description);
	
  // Overlays (checkbox + herramientas Zoom y Descargar SHP)
  Object.entries(state.overlays).forEach(([name, obj]) => {
    const layer = obj.layer;
    const item = document.createElement('div');
    item.className = 'layer-item';
    const checked = state.map.hasLayer(layer) ? 'checked' : '';
    item.innerHTML = `
      <label><input type="checkbox" value="${name}" ${checked}/> Capa: ${name}</label>
      <div class="tools">
        <button data-action="zoom">Zoom</button>
        <button data-action="downloadSHP">SHP</button>
      </div>
    `;
    const checkbox = item.querySelector('input');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.map.addLayer(layer);
      else state.map.removeLayer(layer);
    });
    item.querySelector('[data-action="zoom"]').addEventListener('click', () => fitToLayer(layer));
    item.querySelector('[data-action="downloadSHP"]').addEventListener('click', () => {
      // Crear enlace directo al archivo ZIP del shapefile
      const a = document.createElement('a');
      // Se asume que los archivos están en /shp/ con nombres en minúsculas (ej: riego.zip)
      a.href = `shp/${name.toLowerCase()}.zip`;
      a.download = `${name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    container.appendChild(item);
  });
}

/* -----------------------------------------
   Leyenda de capas
   - Muestra color fijo y nombre de cada overlay
   ----------------------------------------- */
   
// Colores fijos por capa 
function renderLegend() {
  const container = document.getElementById('legend');
  container.innerHTML = '';
  Object.entries(state.overlays).forEach(([name, obj]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
	const color = layerColors[name] || '#cccccc'; // color fijo o gris por defecto
    item.innerHTML = `
      <span class="legend-swatch" style="background:${color}"></span>
      <span>${name}</span>
    `;
    container.appendChild(item);
  });
}

/* -----------------------------------------
   Filtros por atributo específico
   - Reaplica el filtro reconstruyendo cada overlay
   - Atributos soportados: Municipio, Comunidad, Beneficiar
   ----------------------------------------- */
function applyFilter() {
  // Leer valores de la UI
  state.filterText = document.getElementById('filterText').value.trim();
  state.filterField = document.getElementById('filterField').value;

  // Para cada overlay, reconstruir la capa con el filtro aplicado
  Object.entries(state.overlays).forEach(([name, obj]) => {
    const source = getSourceByName(name);
    if (!source) return;

    // Quitar la capa actual del mapa
    state.map.removeLayer(obj.layer);

    // Crear nueva capa con el mismo color y filtro actualizado
    const newLayer = L.geoJSON(source, {
      pointToLayer: (feature, latlng) => {
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<span style="display:inline-block;width:14px;height:14px;background:${obj.color};border-radius:50%;border:2px solid #000;"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        return L.marker(latlng, { icon });
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const title = p.Comunidad || p.Beneficiar || p.Municipio || name;
        const html = `
          <strong>${title}</strong><br/>
          ${Object.keys(p).map(k => `<div><em>${k}</em>: ${p[k]}</div>`).join('')}
        `;
        layer.bindPopup(html);
      },
      filter: (feature) => {
        if (!state.filterText) return true;
        const props = feature.properties || {};
        const val = props[state.filterField];
        if (val === undefined || val === null) return false;
        return val.toString().toLowerCase().includes(state.filterText.toLowerCase());
      }
    });

    // Guardar y añadir la nueva capa
    obj.layer = newLayer;
    newLayer.addTo(state.map);
  });

  // Re-render de UI
  renderLayerList();
  setInfo(state.filterText ? `Filtro aplicado sobre "${state.filterField}": ${state.filterText}` : 'Filtro limpiado.');
}

/* -----------------------------------------
   Botones de la barra superior
   - Añadir marcador manual
   - Limpiar mediciones y marcadores sueltos
   - Aplicar/limpiar filtro
   ----------------------------------------- */
function setupToolbar() {
  document.getElementById('addMarkerBtn').addEventListener('click', () => {
    state.addingMarker = true;
    setInfo('Haz clic en el mapa para colocar un marcador.');
  });

  document.getElementById('clearUserDataBtn').addEventListener('click', () => {
    // Limpiar mediciones/dibujos
    state.drawnItems.clearLayers();
    setInfo('Mediciones y marcadores limpiados.');
  });

  document.getElementById('applyFilterBtn').addEventListener('click', applyFilter);

  document.getElementById('clearFilterBtn').addEventListener('click', () => {
    document.getElementById('filterText').value = '';
    applyFilter();
  });
}

/* -----------------------------------------
   Utilidades varias
   ----------------------------------------- */

// Crear marcador simple con icono verde (para modo manual)
function createCustomMarker(latlng, props = {}) {
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<span style="display:inline-block;width:14px;height:14px;background:#22c55e;border-radius:50%;border:2px solid #0b5;"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  const marker = L.marker(latlng, { icon });
  const content = `<strong>${props.title || 'Marcador'}</strong><br/>${formatLatLng(latlng)}`;
  marker.bindPopup(content);
  marker.on('click', () => setInfo(`Marcador: ${formatLatLng(latlng)}.`));
  return marker;
}

// Medir longitud de una polilínea en kilómetros (sumando segmentos)
function measurePolyline(polyline) {
  const latlngs = polyline.getLatLngs();
  let meters = 0;
  for (let i = 1; i < latlngs.length; i++) {
    meters += latlngs[i - 1].distanceTo(latlngs[i]);
  }
  return meters / 1000.0;
}

// Ajustar vista a una capa (si tiene bounds válidos)
function fitToLayer(layer) {
  try {
    const bounds = layer.getBounds?.();
    if (bounds && bounds.isValid()) state.map.fitBounds(bounds, { padding: [20, 20] });
  } catch (e) { /* ignorar */ }
}

// Ajustar vista a todas las capas cargadas
function fitToAllLayers() {
  const layers = Object.values(state.overlays).map(o => o.layer);
  if (!layers.length) return;
  const group = L.featureGroup(layers);
  const bounds = group.getBounds();
  if (bounds && bounds.isValid()) state.map.fitBounds(bounds, { padding: [20, 20] });
}

// Obtener el GeoJSON original por nombre de capa (desde window)
function getSourceByName(name) {
  switch (name) {
    case 'Riego': return window.riegoGeoJSON;
    case 'REPANA': return window.repanaGeoJSON;
    case 'Reforestación': return window.reforestacionGeoJSON;
    case 'Frutal': return window.frutalGeoJSON;
    case 'Canapas': return window.canapasGeoJSON;
    case 'Apis': return window.apisGeoJSON;
    case 'Gallinero': return window.gallineroGeoJSON;
	case 'Huertos': return window.huertosGeoJSON;
    default: return null;
  }
}

// Mostrar texto en el panel de información
function setInfo(text) {
  const box = document.getElementById('infoBox');
  box.innerHTML = text;
}

// Formatear lat/lon con 5 decimales
function formatLatLng({ lat, lng }) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/* -----------------------------------------
   Inicio de la aplicación
   ----------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  initMap();       // crea mapa y controles base
  loadLayers();    // carga overlays desde Data/ y construye leyenda
  setupToolbar();  // conecta eventos de la barra de herramientas
});
