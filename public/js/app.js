/* ════════════════════════════════════════════════════════════
   Lavamax POS — Lógica principal del frontend (v2 Vercel+Turso)
   ════════════════════════════════════════════════════════════ */

// ── Estado global ─────────────────────────────────────────────────────────────
let prendas = [];
let partidas = [];
let ultimoTicket = null;
let sesion = null;

// ── API helper con JWT ────────────────────────────────────────────────────────
async function api(url, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const token = localStorage.getItem('lavamax_token');
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) {
      localStorage.removeItem('lavamax_token');
      sesion = null;
      mostrarLogin();
      return {};
    }
    return await res.json();
  } catch (e) {
    toast('Error de conexión con el servidor', 'error');
    return {};
  }
}

// ── Inicialización ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  actualizarFecha();
  setInterval(actualizarFecha, 60000);

  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('loginError');
    err.classList.add('hidden');
    const btn = e.submitter || document.querySelector('#loginForm button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    const res = await api('/api/login', 'POST', {
      usuario: document.getElementById('usuario').value.trim(),
      password: document.getElementById('password').value
    });
    btn.disabled = false;
    btn.textContent = 'Iniciar Sesión →';
    if (res.ok) {
      localStorage.setItem('lavamax_token', res.token);
      sesion = res;
      iniciarApp();
    } else {
      err.textContent = res.mensaje || 'Error al iniciar sesión';
      err.classList.remove('hidden');
    }
  });

  await verificarSesion();
});

async function verificarSesion() {
  const token = localStorage.getItem('lavamax_token');
  if (!token) { mostrarLogin(); return; }
  const data = await api('/api/me');
  if (data.autenticado) {
    sesion = data;
    iniciarApp();
  } else {
    localStorage.removeItem('lavamax_token');
    mostrarLogin();
  }
}

function mostrarLogin() {
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.body.className = 'login-body';
}

async function iniciarApp() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.body.className = '';
  document.getElementById('sidebarNombre').textContent = sesion.nombre;
  document.getElementById('sidebarRol').textContent = sesion.rol === 'admin' ? 'Administrador' : 'Empleado';

  if (sesion.rol === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  configurarEventos();
  await cargarPrendas();
  navegarA('dashboard');
}

function configurarEventos() {
  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', 'POST');
    localStorage.removeItem('lavamax_token');
    sesion = null;
    mostrarLogin();
  });

  // Navegación sidebar
  document.querySelectorAll('.nav-item[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navegarA(link.dataset.page);
      // Cerrar sidebar en mobile
      document.getElementById('app').classList.remove('sidebar-open');
    });
  });

  // Hamburger menu
  const hamburger = document.getElementById('hamburgerBtn');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      document.getElementById('app').classList.toggle('sidebar-open');
    });
  }

  // Cerrar sidebar al tocar overlay
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      document.getElementById('app').classList.remove('sidebar-open');
    });
  }

  // Selector de prenda en nuevo ticket
  document.getElementById('tPrenda').addEventListener('change', () => {
    const id = parseInt(document.getElementById('tPrenda').value);
    const prenda = prendas.find(p => p.id === id);
    actualizarModosCobro(prenda);
  });

  // Modo de cobro cambia inputs visibles
  document.getElementById('tModo').addEventListener('change', actualizarInputsModo);

  // Cerrar modal al hacer click en el overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // Anticipo en tiempo real
  const anticipoInput = document.getElementById('tAnticipo');
  if (anticipoInput) {
    anticipoInput.addEventListener('input', actualizarResumenAnticipo);
  }
}

// ── Navegación ────────────────────────────────────────────────────────────────
function navegarA(pagina) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${pagina}"]`);
  if (navItem) navItem.classList.add('active');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page${capitalizar(pagina)}`);
  if (pageEl) pageEl.classList.add('active');

  const titulos = {
    'dashboard': 'Inicio', 'nuevo-ticket': 'Nuevo Ticket', 'tickets': 'Tickets',
    'reporte': 'Reportes', 'prendas': 'Tipos de Prenda', 'usuarios': 'Usuarios'
  };
  document.getElementById('pageTitle').textContent = titulos[pagina] || pagina;

  if (pagina === 'dashboard')    cargarDashboard();
  if (pagina === 'tickets')      cargarTickets();
  if (pagina === 'reporte')      cargarReporte();
  if (pagina === 'prendas')      cargarListaPrendas();
  if (pagina === 'usuarios')     cargarUsuarios();
  if (pagina === 'nuevo-ticket') limpiarFormTicket();
}

function capitalizar(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

// ── Prendas (tipos) ───────────────────────────────────────────────────────────
async function cargarPrendas() {
  prendas = await api('/api/prendas');
  if (!Array.isArray(prendas)) prendas = [];
  const sel = document.getElementById('tPrenda');
  sel.innerHTML = '<option value="">Seleccionar tipo de prenda...</option>';
  prendas.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    let label = `${p.nombre} — $${p.precio_kg.toFixed(2)}/kg`;
    if (p.modo_cobro === 'pieza' || p.modo_cobro === 'ambos') {
      label += ` | $${(p.precio_pieza || 0).toFixed(2)}/pza`;
    }
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

function actualizarModosCobro(prenda) {
  const modoSelect = document.getElementById('tModo');
  const precioDisplay = document.getElementById('tPrecioKg');
  modoSelect.innerHTML = '';

  if (!prenda) {
    modoSelect.innerHTML = '<option value="kg">Por kg</option>';
    precioDisplay.textContent = '—';
    actualizarInputsModo();
    return;
  }

  if (prenda.modo_cobro === 'kg' || prenda.modo_cobro === 'ambos') {
    modoSelect.innerHTML += `<option value="kg">Por kg ($${prenda.precio_kg.toFixed(2)}/kg)</option>`;
  }
  if (prenda.modo_cobro === 'pieza' || prenda.modo_cobro === 'ambos') {
    modoSelect.innerHTML += `<option value="pieza">Por pieza ($${(prenda.precio_pieza || 0).toFixed(2)}/pza)</option>`;
  }

  actualizarInputsModo();
  actualizarPrecioDisplay();
}

function actualizarInputsModo() {
  const modo = document.getElementById('tModo').value;
  const kgGroup = document.getElementById('grupoKg');
  const gramosGroup = document.getElementById('grupoGramos');
  const piezasGroup = document.getElementById('grupoPiezas');

  if (modo === 'pieza') {
    kgGroup.classList.add('hidden');
    gramosGroup.classList.add('hidden');
    piezasGroup.classList.remove('hidden');
  } else {
    kgGroup.classList.remove('hidden');
    gramosGroup.classList.remove('hidden');
    piezasGroup.classList.add('hidden');
  }
  actualizarPrecioDisplay();
}

function actualizarPrecioDisplay() {
  const id = parseInt(document.getElementById('tPrenda').value);
  const prenda = prendas.find(p => p.id === id);
  const modo = document.getElementById('tModo').value;
  const display = document.getElementById('tPrecioKg');

  if (!prenda) { display.textContent = '—'; return; }
  if (modo === 'pieza') {
    display.textContent = `$${(prenda.precio_pieza || 0).toFixed(2)}/pza`;
  } else {
    display.textContent = `$${prenda.precio_kg.toFixed(2)}/kg`;
  }
}

async function cargarListaPrendas() {
  const lista = document.getElementById('listaPrendas');
  const data = await api('/api/prendas');
  if (!data.length) { lista.innerHTML = '<p style="padding:1.5rem;color:var(--gray-400)">Sin prendas registradas</p>'; return; }
  lista.innerHTML = `
    <table class="main-table">
      <thead><tr>
        <th>Tipo de prenda</th>
        <th>Descripción</th>
        <th>$/kg</th>
        <th>$/pieza</th>
        <th>Modo</th>
        <th>Acciones</th>
      </tr></thead>
      <tbody>
        ${data.map(p => `
          <tr>
            <td data-label="Prenda"><strong>${p.nombre}</strong></td>
            <td data-label="Descripción" style="color:var(--gray-500)">${p.descripcion || '—'}</td>
            <td data-label="$/kg"><strong style="color:var(--green-d)">$${p.precio_kg.toFixed(2)}</strong></td>
            <td data-label="$/pieza"><strong style="color:var(--primary)">$${(p.precio_pieza || 0).toFixed(2)}</strong></td>
            <td data-label="Modo"><span class="badge badge-en_proceso">${p.modo_cobro === 'ambos' ? 'kg + pieza' : p.modo_cobro}</span></td>
            <td><button class="btn btn-sm btn-outline" onclick="modalPrenda(${p.id})">Editar</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function modalPrenda(id = null) {
  const prenda = id ? prendas.find(p => p.id === id) : null;
  document.getElementById('prendaId').value = id || '';
  document.getElementById('pNombre').value = prenda ? prenda.nombre : '';
  document.getElementById('pPrecioKg').value = prenda ? prenda.precio_kg : '';
  document.getElementById('pPrecioPieza').value = prenda ? (prenda.precio_pieza || 0) : '';
  document.getElementById('pModoCobro').value = prenda ? (prenda.modo_cobro || 'kg') : 'kg';
  document.getElementById('pDesc').value = prenda ? prenda.descripcion : '';
  document.getElementById('modalPrendaTitulo').textContent = prenda ? 'Editar prenda' : 'Nueva prenda';
  document.getElementById('modalPrendaEl').classList.remove('hidden');
}

async function guardarPrenda() {
  const id = document.getElementById('prendaId').value;
  const nombre = document.getElementById('pNombre').value.trim();
  const precio_kg = parseFloat(document.getElementById('pPrecioKg').value);
  const precio_pieza = parseFloat(document.getElementById('pPrecioPieza').value) || 0;
  const modo_cobro = document.getElementById('pModoCobro').value;
  const descripcion = document.getElementById('pDesc').value.trim();
  if (!nombre || isNaN(precio_kg) || precio_kg <= 0) { toast('Completa los campos correctamente', 'error'); return; }

  const body = { nombre, precio_kg, precio_pieza, modo_cobro, descripcion };
  if (id) {
    await api(`/api/prendas/${id}`, 'PUT', body);
  } else {
    await api('/api/prendas', 'POST', body);
  }
  cerrarModal('modalPrendaEl');
  await cargarPrendas();
  cargarListaPrendas();
  toast('Prenda guardada correctamente', 'success');
}

// ── Nuevo Ticket ───────────────────────────────────────────────────────────────
function limpiarFormTicket() {
  partidas = [];
  document.getElementById('tCliente').value = '';
  document.getElementById('tTelefono').value = '';
  document.getElementById('tObs').value = '';
  document.getElementById('tPrenda').value = '';
  document.getElementById('tKilos').value = '';
  document.getElementById('tGramos').value = '';
  document.getElementById('tPiezas').value = '';
  document.getElementById('tModo').innerHTML = '<option value="kg">Por kg</option>';
  document.getElementById('tPrecioKg').textContent = '—';
  document.getElementById('tAnticipo').value = '';
  document.getElementById('ticketError').classList.add('hidden');
  actualizarInputsModo();
  renderPartidas();
}

function agregarPartida() {
  const prendaId = parseInt(document.getElementById('tPrenda').value);
  const modo = document.getElementById('tModo').value;
  if (!prendaId) { toast('Selecciona un tipo de prenda', 'error'); return; }

  const prenda = prendas.find(p => p.id === prendaId);
  let subtotal = 0, kilos = 0, piezas = 0;

  if (modo === 'pieza') {
    piezas = parseInt(document.getElementById('tPiezas').value) || 0;
    if (piezas <= 0) { toast('Ingresa la cantidad de piezas', 'error'); return; }
    subtotal = parseFloat((piezas * (prenda.precio_pieza || 0)).toFixed(2));
  } else {
    const kgVal = parseFloat(document.getElementById('tKilos').value) || 0;
    const grVal = parseFloat(document.getElementById('tGramos').value) || 0;
    kilos = parseFloat((kgVal + grVal / 1000).toFixed(3));
    if (kilos <= 0) { toast('Ingresa el peso correctamente', 'error'); return; }
    subtotal = parseFloat((kilos * prenda.precio_kg).toFixed(2));
  }

  // Si ya existe el mismo tipo y mismo modo, sumar
  const existe = partidas.find(p => p.tipo_prenda_id === prendaId && p.modo === modo);
  if (existe) {
    if (modo === 'pieza') {
      existe.piezas += piezas;
      existe.subtotal = parseFloat((existe.piezas * (prenda.precio_pieza || 0)).toFixed(2));
    } else {
      existe.kilos = parseFloat((existe.kilos + kilos).toFixed(3));
      existe.subtotal = parseFloat((existe.kilos * existe.precio_kg).toFixed(2));
    }
  } else {
    partidas.push({
      tipo_prenda_id: prendaId, nombre: prenda.nombre, modo,
      kilos, piezas, precio_kg: prenda.precio_kg, precio_pieza: prenda.precio_pieza || 0, subtotal
    });
  }

  document.getElementById('tKilos').value = '';
  document.getElementById('tGramos').value = '';
  document.getElementById('tPiezas').value = '';
  renderPartidas();
}

function quitarPartida(idx) {
  partidas.splice(idx, 1);
  renderPartidas();
}

function renderPartidas() {
  const tbody = document.getElementById('bodyPartidas');
  const resumen = document.getElementById('resumenPartidas');
  const totalEl = document.getElementById('resumenTotal');

  if (partidas.length === 0) {
    tbody.innerHTML = '<tr id="emptyRow"><td colspan="6" class="empty-row">Sin prendas agregadas</td></tr>';
    resumen.innerHTML = '<p style="padding:1rem 1.4rem;color:var(--gray-400);font-size:.88rem">Agrega prendas para ver el resumen</p>';
    totalEl.textContent = '$0.00';
    actualizarResumenAnticipo();
    return;
  }

  tbody.innerHTML = partidas.map((p, i) => {
    const cantCol = p.modo === 'pieza' ? `${p.piezas} pza(s)` : `${p.kilos.toFixed(2)} kg`;
    const precioCol = p.modo === 'pieza' ? `$${p.precio_pieza.toFixed(2)}/pza` : `$${p.precio_kg.toFixed(2)}/kg`;
    return `<tr>
      <td data-label="Prenda"><strong>${p.nombre}</strong></td>
      <td data-label="Modo"><span class="badge badge-en_proceso">${p.modo}</span></td>
      <td data-label="Cantidad">${cantCol}</td>
      <td data-label="Precio">${precioCol}</td>
      <td data-label="Subtotal"><strong style="color:var(--green-d)">$${p.subtotal.toFixed(2)}</strong></td>
      <td><button class="btn btn-sm btn-ghost" onclick="quitarPartida(${i})" title="Quitar">✕</button></td>
    </tr>`;
  }).join('');

  resumen.innerHTML = partidas.map(p => {
    const det = p.modo === 'pieza' ? `${p.piezas} pza(s)` : `${p.kilos.toFixed(2)} kg`;
    return `<div class="resumen-item">
      <span class="resumen-item-label">${p.nombre} (${det})</span>
      <span><strong>$${p.subtotal.toFixed(2)}</strong></span>
    </div>`;
  }).join('');

  const total = partidas.reduce((s, p) => s + p.subtotal, 0);
  totalEl.textContent = `$${total.toFixed(2)}`;
  actualizarResumenAnticipo();
}

function actualizarResumenAnticipo() {
  const total = partidas.reduce((s, p) => s + p.subtotal, 0);
  const anticipo = parseFloat(document.getElementById('tAnticipo').value) || 0;
  const saldo = Math.max(0, total - anticipo);
  const saldoEl = document.getElementById('resumenSaldo');
  if (saldoEl) {
    saldoEl.textContent = `$${saldo.toFixed(2)}`;
  }
}

async function guardarTicket() {
  const errEl = document.getElementById('ticketError');
  errEl.classList.add('hidden');
  if (partidas.length === 0) { errEl.textContent = 'Agrega al menos una prenda'; errEl.classList.remove('hidden'); return; }

  const anticipo = parseFloat(document.getElementById('tAnticipo').value) || 0;
  const total = partidas.reduce((s, p) => s + p.subtotal, 0);
  if (anticipo > total) { errEl.textContent = 'El anticipo no puede ser mayor al total'; errEl.classList.remove('hidden'); return; }

  const body = {
    cliente: document.getElementById('tCliente').value.trim() || 'Cliente general',
    telefono: document.getElementById('tTelefono').value.trim(),
    observaciones: document.getElementById('tObs').value.trim(),
    anticipo,
    partidas: partidas.map(p => ({ tipo_prenda_id: p.tipo_prenda_id, modo: p.modo, kilos: p.kilos, piezas: p.piezas }))
  };

  const res = await api('/api/tickets', 'POST', body);
  if (res.ok) {
    ultimoTicket = { ...res, cliente: body.cliente, telefono: body.telefono, partidas: [...partidas], anticipo: res.anticipo, saldo: res.saldo };
    mostrarModalExito();
  } else {
    errEl.textContent = res.error || 'Error al guardar el ticket';
    errEl.classList.remove('hidden');
  }
}

function mostrarModalExito() {
  const anticipoLine = ultimoTicket.anticipo > 0
    ? `<div class="ex-row"><span>Anticipo:</span><strong style="color:var(--primary)">$${ultimoTicket.anticipo.toFixed(2)}</strong></div>
       <div class="ex-row"><span>Saldo:</span><strong style="color:var(--amber)">$${ultimoTicket.saldo.toFixed(2)}</strong></div>`
    : '';

  document.getElementById('exitoDetalle').innerHTML = `
    <div class="ex-row"><span>Número de ticket:</span><strong>${ultimoTicket.numero}</strong></div>
    <div class="ex-row"><span>Cliente:</span><span>${ultimoTicket.cliente || 'Cliente general'}</span></div>
    <div class="ex-row"><span>Prendas:</span><span>${ultimoTicket.partidas.length} tipo(s)</span></div>
    <div class="ex-row" style="border-top:1px solid var(--gray-200);margin-top:.5rem;padding-top:.5rem">
      <span>Total:</span><strong style="color:var(--green-d);font-size:1.1rem">$${ultimoTicket.total.toFixed(2)}</strong>
    </div>
    ${anticipoLine}`;
  document.getElementById('modalExito').classList.remove('hidden');
}

function nuevoTicketLimpio() {
  cerrarModal('modalExito');
  limpiarFormTicket();
}

function imprimirTicket() {
  if (!ultimoTicket) return;
  const anticipoHtml = ultimoTicket.anticipo > 0
    ? `<div class="row"><span>ANTICIPO:</span><span>$${ultimoTicket.anticipo.toFixed(2)}</span></div>
       <div class="row"><span>SALDO:</span><span>$${ultimoTicket.saldo.toFixed(2)}</span></div>`
    : '';

  const win = window.open('', '_blank', 'width=400,height=600');
  win.document.write(`
    <html><head><title>Ticket ${ultimoTicket.numero}</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size:13px; padding:1rem; max-width:320px; margin:auto; }
      h2 { text-align:center; font-size:1.2rem; border-bottom:1px dashed #000; padding-bottom:.5rem; }
      .logo { text-align:center; font-size:2rem; margin-bottom:.25rem; }
      .row { display:flex; justify-content:space-between; padding:.2rem 0; }
      .dashed { border-bottom:1px dashed #000; margin:.5rem 0; }
      .total { font-size:1.1rem; font-weight:bold; }
      .footer { text-align:center; margin-top:1rem; font-size:.8rem; color:#555; }
    </style></head><body>
    <div class="logo">🧺</div>
    <h2>LAVAMAX</h2>
    <p style="text-align:center;font-size:.8rem">Sistema de Lavandería</p>
    <div class="dashed"></div>
    <div class="row"><span>Ticket:</span><strong>${ultimoTicket.numero}</strong></div>
    <div class="row"><span>Fecha:</span><span>${new Date().toLocaleString('es-MX')}</span></div>
    <div class="row"><span>Cliente:</span><span>${ultimoTicket.cliente || 'Cliente general'}</span></div>
    <div class="dashed"></div>
    <div><strong>PRENDAS:</strong></div>
    ${ultimoTicket.partidas.map(p => {
      const det = p.modo === 'pieza' ? `${p.piezas} pza × $${p.precio_pieza.toFixed(2)}` : `${p.kilos.toFixed(2)} kg × $${p.precio_kg.toFixed(2)}`;
      return `<div class="row"><span>${p.nombre}</span><span>${det}</span></div>
              <div class="row" style="padding-left:1rem"><span></span><strong>$${p.subtotal.toFixed(2)}</strong></div>`;
    }).join('')}
    <div class="dashed"></div>
    <div class="row total"><span>TOTAL:</span><span>$${ultimoTicket.total.toFixed(2)}</span></div>
    ${anticipoHtml}
    <div class="dashed"></div>
    <div class="footer">
      <p>Gracias por su preferencia</p>
      <p>Conserve su ticket para reclamar su ropa</p>
    </div>
    <script>window.print();window.close();<\/script>
    </body></html>`);
  win.document.close();
}

// ── Lista de Tickets ──────────────────────────────────────────────────────────
async function cargarTickets() {
  const desde = document.getElementById('fDesde').value;
  const hasta = document.getElementById('fHasta').value;
  const estado = document.getElementById('fEstado').value;
  let url = '/api/tickets?';
  if (desde) url += `desde=${desde}&`;
  if (hasta) url += `hasta=${hasta}&`;
  if (estado) url += `estado=${estado}&`;

  const tickets = await api(url);
  const el = document.getElementById('listaTickets');

  if (!Array.isArray(tickets) || !tickets.length) {
    el.innerHTML = '<p style="padding:1.5rem;color:var(--gray-400);text-align:center">No hay tickets con esos filtros</p>';
    return;
  }

  el.innerHTML = `
    <table class="main-table">
      <thead><tr>
        <th>Número</th>
        <th>Fecha</th>
        <th>Cliente</th>
        <th>Total</th>
        <th>Anticipo</th>
        <th>Estado</th>
        <th>Pago</th>
        <th>Empleado</th>
        <th>Acciones</th>
      </tr></thead>
      <tbody>
        ${tickets.map(t => {
          const anticipoBadge = (t.anticipo > 0 && !t.pagado)
            ? `<span class="badge badge-anticipo">$${parseFloat(t.anticipo).toFixed(0)}/$${parseFloat(t.total).toFixed(0)}</span>`
            : (t.pagado ? `<span class="badge badge-pagado">Completo</span>` : '—');
          return `<tr>
            <td data-label="Número"><code style="font-size:.8rem;background:var(--gray-100);padding:.2rem .4rem;border-radius:4px">${t.numero}</code></td>
            <td data-label="Fecha" style="color:var(--gray-500);font-size:.85rem">${formatFecha(t.fecha)}</td>
            <td data-label="Cliente"><strong>${t.cliente}</strong>${t.telefono ? `<br><small style="color:var(--gray-400)">${t.telefono}</small>` : ''}</td>
            <td data-label="Total"><strong style="color:var(--green-d);font-size:1rem">$${parseFloat(t.total).toFixed(2)}</strong></td>
            <td data-label="Anticipo">${anticipoBadge}</td>
            <td data-label="Estado">${badgeEstado(t.estado)}</td>
            <td data-label="Pago">${t.pagado ? '<span class="badge badge-pagado">Pagado</span>' : '<span class="badge badge-pendiente-pago">Pendiente</span>'}</td>
            <td data-label="Empleado" style="color:var(--gray-500);font-size:.85rem">${t.empleado || '—'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="verTicket(${t.id})">Ver</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

async function verTicket(id) {
  const ticket = await api(`/api/tickets/${id}`);
  const el = document.getElementById('modalTicketBody');

  const pagosHtml = (ticket.pagos && ticket.pagos.length > 0)
    ? `<div style="margin-top:1rem">
        <h4 style="font-size:.85rem;font-weight:700;color:var(--gray-600);margin-bottom:.5rem">Historial de pagos</h4>
        <table class="main-table" style="border:1px solid var(--gray-200);border-radius:8px;overflow:hidden">
          <thead><tr><th>Fecha</th><th>Monto</th><th>Tipo</th><th>Usuario</th></tr></thead>
          <tbody>${ticket.pagos.map(pg => `
            <tr>
              <td>${formatFecha(pg.fecha)}</td>
              <td><strong style="color:var(--green-d)">$${parseFloat(pg.monto).toFixed(2)}</strong></td>
              <td><span class="badge badge-en_proceso">${pg.tipo}</span></td>
              <td>${pg.usuario_nombre || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    : '';

  const saldoPendiente = parseFloat(ticket.total) - parseFloat(ticket.anticipo || 0);
  const anticipoInfo = `
    <div class="encabezado-item"><label>Anticipo</label><span style="color:var(--primary);font-weight:700">$${parseFloat(ticket.anticipo || 0).toFixed(2)}</span></div>
    <div class="encabezado-item"><label>Saldo</label><span style="color:${saldoPendiente > 0 ? 'var(--amber)' : 'var(--green-d)'};font-weight:700">$${Math.max(0, saldoPendiente).toFixed(2)}</span></div>`;

  el.innerHTML = `
    <div class="ticket-detalle">
      <div class="encabezado">
        <div class="encabezado-item"><label>Número</label><span>${ticket.numero}</span></div>
        <div class="encabezado-item"><label>Fecha</label><span>${formatFecha(ticket.fecha)}</span></div>
        <div class="encabezado-item"><label>Cliente</label><span>${ticket.cliente}</span></div>
        <div class="encabezado-item"><label>Teléfono</label><span>${ticket.telefono || '—'}</span></div>
        <div class="encabezado-item"><label>Estado</label><span>${badgeEstado(ticket.estado)}</span></div>
        <div class="encabezado-item"><label>Pago</label><span>${ticket.pagado ? '<span class="badge badge-pagado">Pagado</span>' : '<span class="badge badge-pendiente-pago">Pendiente</span>'}</span></div>
        ${anticipoInfo}
        ${ticket.observaciones ? `<div class="encabezado-item" style="grid-column:1/-1"><label>Observaciones</label><span>${ticket.observaciones}</span></div>` : ''}
      </div>

      <div class="detalle-acciones">
        <strong style="margin-right:.25rem;color:var(--gray-600);font-size:.85rem">Cambiar estado:</strong>
        ${['pendiente', 'en_proceso', 'listo', 'entregado'].map(e => `
          <button class="btn btn-sm ${ticket.estado === e ? 'btn-primary' : 'btn-ghost'}"
            onclick="cambiarEstado(${ticket.id},'${e}')">
            ${etiquetaEstado(e)}
          </button>`).join('')}
      </div>

      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
        ${!ticket.pagado ? `<button class="btn btn-success btn-sm" onclick="marcarPagado(${ticket.id})">Liquidar total</button>` : ''}
        ${(!ticket.pagado && saldoPendiente > 0) ? `<button class="btn btn-primary btn-sm" onclick="mostrarAbonar(${ticket.id}, ${saldoPendiente.toFixed(2)})">Abonar</button>` : ''}
      </div>

      <table class="main-table" style="border:1px solid var(--gray-200);border-radius:8px;overflow:hidden">
        <thead><tr><th>Prenda</th><th>Modo</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${ticket.partidas.map(p => {
            const cant = p.modo === 'pieza' ? `${p.piezas} pza(s)` : `${parseFloat(p.kilos).toFixed(2)} kg`;
            const precio = p.modo === 'pieza' ? `$${parseFloat(p.precio_pieza).toFixed(2)}/pza` : `$${parseFloat(p.precio_kg).toFixed(2)}/kg`;
            return `<tr>
              <td><strong>${p.tipo_nombre || '?'}</strong></td>
              <td><span class="badge badge-en_proceso">${p.modo}</span></td>
              <td>${cant}</td>
              <td>${precio}</td>
              <td><strong style="color:var(--green-d)">$${parseFloat(p.subtotal).toFixed(2)}</strong></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="detalle-total">Total: $${parseFloat(ticket.total).toFixed(2)}</div>
      ${pagosHtml}
    </div>`;

  document.getElementById('modalTicketTitulo').textContent = `Ticket ${ticket.numero}`;
  document.getElementById('modalTicket').classList.remove('hidden');
  window._ticketActual = ticket;
}

function mostrarAbonar(ticketId, saldoMax) {
  const monto = prompt(`Monto a abonar (saldo pendiente: $${saldoMax}):`);
  if (!monto) return;
  const val = parseFloat(monto);
  if (isNaN(val) || val <= 0) { toast('Monto inválido', 'error'); return; }
  if (val > saldoMax) { toast('El abono no puede ser mayor al saldo', 'error'); return; }
  abonarTicket(ticketId, val);
}

async function abonarTicket(id, monto) {
  const res = await api(`/api/tickets/${id}/anticipo`, 'PATCH', { monto });
  if (res.ok !== undefined) {
    toast('Abono registrado', 'success');
    verTicket(id);
    cargarTickets();
    if (document.getElementById('pageDashboard').classList.contains('active')) cargarDashboard();
  }
}

async function cambiarEstado(id, estado) {
  await api(`/api/tickets/${id}/estado`, 'PATCH', { estado });
  toast(`Estado actualizado: ${etiquetaEstado(estado)}`, 'success');
  verTicket(id);
  cargarTickets();
  if (document.getElementById('pageDashboard').classList.contains('active')) cargarDashboard();
}

async function marcarPagado(id) {
  await api(`/api/tickets/${id}/pagar`, 'PATCH', {});
  toast('Ticket liquidado', 'success');
  verTicket(id);
  cargarTickets();
  if (document.getElementById('pageDashboard').classList.contains('active')) cargarDashboard();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function cargarDashboard() {
  const [hoy, tickets] = await Promise.all([api('/api/reporte/hoy'), api('/api/tickets?')]);

  const pendiente = parseFloat(hoy.total_ventas || 0) - parseFloat(hoy.cobrado || 0);

  document.getElementById('statTickets').textContent = hoy.total_tickets || 0;
  document.getElementById('statVentas').textContent = `$${parseFloat(hoy.total_ventas || 0).toFixed(2)}`;
  document.getElementById('statCobrado').textContent = `$${parseFloat(hoy.cobrado || 0).toFixed(2)}`;
  document.getElementById('statPendiente').textContent = `$${pendiente.toFixed(2)}`;

  const tipEl = document.getElementById('tablaPorTipo');
  if (!hoy.porTipo || !hoy.porTipo.length) {
    tipEl.innerHTML = '<p style="padding:1.25rem;color:var(--gray-400)">Sin ventas hoy</p>';
  } else {
    tipEl.innerHTML = hoy.porTipo.map(t => {
      const det = [];
      if (t.kilos > 0) det.push(`${parseFloat(t.kilos).toFixed(2)} kg`);
      if (t.piezas > 0) det.push(`${t.piezas} pzas`);
      return `<div class="tipo-row">
        <span class="tipo-nombre">${t.nombre}</span>
        <span class="tipo-datos">
          <span>${det.join(' + ') || '0 kg'}</span>
          <strong style="color:var(--green-d)">$${parseFloat(t.subtotal).toFixed(2)}</strong>
        </span>
      </div>`;
    }).join('');
  }

  const utEl = document.getElementById('ultimosTickets');
  const recientes = Array.isArray(tickets) ? tickets.slice(0, 6) : [];
  if (!recientes.length) {
    utEl.innerHTML = '<p style="padding:1.25rem;color:var(--gray-400)">Sin tickets registrados</p>';
  } else {
    utEl.innerHTML = `
      <table class="main-table">
        <thead><tr><th>Número</th><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead>
        <tbody>
          ${recientes.map(t => `
            <tr style="cursor:pointer" onclick="verTicket(${t.id})">
              <td><code style="font-size:.78rem;background:var(--gray-100);padding:.15rem .35rem;border-radius:4px">${t.numero}</code></td>
              <td>${t.cliente}</td>
              <td><strong style="color:var(--green-d)">$${parseFloat(t.total).toFixed(2)}</strong></td>
              <td>${badgeEstado(t.estado)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
}

// ── Reporte ───────────────────────────────────────────────────────────────────
async function cargarReporte() {
  const [hoy, semana] = await Promise.all([api('/api/reporte/hoy'), api('/api/reporte/semana')]);

  document.getElementById('rStatTickets').textContent = hoy.total_tickets || 0;
  document.getElementById('rStatVentas').textContent = `$${parseFloat(hoy.total_ventas || 0).toFixed(2)}`;
  document.getElementById('rStatCobrado').textContent = `$${parseFloat(hoy.cobrado || 0).toFixed(2)}`;

  const semEl = document.getElementById('tablaSemana');
  if (!Array.isArray(semana) || !semana.length) {
    semEl.innerHTML = '<p style="padding:1.25rem;color:var(--gray-400)">Sin datos esta semana</p>';
  } else {
    semEl.innerHTML = `
      <table class="main-table">
        <thead><tr><th>Día</th><th>Tickets</th><th>Ventas</th></tr></thead>
        <tbody>
          ${semana.map(d => `
            <tr>
              <td>${formatFechaCorta(d.dia)}</td>
              <td>${d.tickets}</td>
              <td><strong style="color:var(--green-d)">$${parseFloat(d.ventas).toFixed(2)}</strong></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  const tipEl = document.getElementById('rTablaPorTipo');
  if (!hoy.porTipo || !hoy.porTipo.length) {
    tipEl.innerHTML = '<p style="padding:1.25rem;color:var(--gray-400)">Sin ventas hoy</p>';
  } else {
    tipEl.innerHTML = `
      <table class="main-table">
        <thead><tr><th>Tipo de prenda</th><th>Cantidad</th><th>Total $</th></tr></thead>
        <tbody>
          ${hoy.porTipo.map(t => {
            const det = [];
            if (t.kilos > 0) det.push(`${parseFloat(t.kilos).toFixed(2)} kg`);
            if (t.piezas > 0) det.push(`${t.piezas} pzas`);
            return `<tr>
              <td><strong>${t.nombre}</strong></td>
              <td>${det.join(' + ') || '0 kg'}</td>
              <td><strong style="color:var(--green-d)">$${parseFloat(t.subtotal).toFixed(2)}</strong></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
}

// ── Usuarios ──────────────────────────────────────────────────────────────────
async function cargarUsuarios() {
  const usuarios = await api('/api/usuarios');
  if (!Array.isArray(usuarios)) return;
  const el = document.getElementById('listaUsuarios');
  el.innerHTML = `
    <table class="main-table">
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th></tr></thead>
      <tbody>
        ${usuarios.map(u => `
          <tr>
            <td data-label="Usuario"><code style="font-size:.85rem;background:var(--gray-100);padding:.2rem .4rem;border-radius:4px">${u.usuario}</code></td>
            <td data-label="Nombre">${u.nombre}</td>
            <td data-label="Rol">${u.rol === 'admin' ? '<span class="badge badge-en_proceso">Administrador</span>' : '<span class="badge badge-entregado">Empleado</span>'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function modalUsuario() {
  document.getElementById('uUsuario').value = '';
  document.getElementById('uNombre').value = '';
  document.getElementById('uPassword').value = '';
  document.getElementById('uRol').value = 'empleado';
  document.getElementById('modalUsuarioEl').classList.remove('hidden');
}

async function guardarUsuario() {
  const usuario = document.getElementById('uUsuario').value.trim();
  const nombre = document.getElementById('uNombre').value.trim();
  const password = document.getElementById('uPassword').value;
  const rol = document.getElementById('uRol').value;
  if (!usuario || !nombre || !password) { toast('Completa todos los campos', 'error'); return; }

  const res = await api('/api/usuarios', 'POST', { usuario, nombre, password, rol });
  if (res.error) { toast(res.error, 'error'); return; }
  cerrarModal('modalUsuarioEl');
  cargarUsuarios();
  toast('Usuario creado correctamente', 'success');
}

// ── Helpers UI ────────────────────────────────────────────────────────────────
function cerrarModal(id) { document.getElementById(id).classList.add('hidden'); }

function badgeEstado(estado) {
  const mapa = { pendiente: 'Pendiente', en_proceso: 'En proceso', listo: 'Listo', entregado: 'Entregado' };
  return `<span class="badge badge-${estado}">${mapa[estado] || estado}</span>`;
}

function etiquetaEstado(e) {
  return { pendiente: 'Pendiente', en_proceso: 'En proceso', listo: 'Listo', entregado: 'Entregado' }[e] || e;
}

function formatFecha(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatFechaCorta(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const fecha = new Date(y, m - 1, d);
  return fecha.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' });
}

function actualizarFecha() {
  const el = document.getElementById('topbarFecha');
  if (el) el.textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${tipo}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}
