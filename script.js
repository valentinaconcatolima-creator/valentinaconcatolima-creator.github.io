const $ = id => document.getElementById(id);
const names = { cafe: "Café da Praça", lanche: "Lanche da Esquina" };
const costs = { cafe: 150, lanche: 250 };

const STORAGE_KEY = 'bairro_circular_dados';
function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function persistRecords(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

let records = loadRecords();
let busy = false;

const format = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const dateKey = value => new Date(value).toLocaleDateString('sv-SE');

function stats() {
  const logs = records.filter(r => r.tipo === 'reciclagem');
  const spent = records
    .filter(r => r.tipo === 'resgate')
    .reduce((n, r) => n + Number(r.pontos || 0), 0);

  return {
    logs,
    earned: logs.reduce((n, r) => n + Number(r.pontos || 0), 0),
    spent,
    weight: logs.reduce((n, r) => n + Number(r.quantidade_kg || 0), 0)
  };
}

function calculatePoints(kg) {
  const logs = stats().logs;
  const today = dateKey(new Date());
  const yesterday = dateKey(Date.now() - 86400000);
  const firstToday = !logs.some(r => dateKey(r.criado_em) === today);
  const consecutive = firstToday && logs.some(r => dateKey(r.criado_em) === yesterday);

  return Math.round(kg * 20) + 10 + (firstToday ? 10 : 0) + (consecutive ? 15 : 0);
}

function updateEstimate() {
  const raw = String($('quantity').value).replace(',', '.');
  const kg = Number(raw);
  $('estimated-points').textContent = kg > 0 ? '+ ' + calculatePoints(kg) + ' pts' : '+ 0 pts';
}

function render() {
  const s = stats();
  const balance = s.earned - s.spent;
  const level = Math.floor(s.earned / 200) + 1;
  const levelNames = ['Semente', 'Broto', 'Jardineiro', 'Guardião', 'Embaixador'];

  $('points').textContent = format.format(balance);
  $('level').textContent = level + ' · ' + levelNames[Math.min(level - 1, 4)];
  $('weight').textContent = format.format(s.weight) + ' kg';
  $('frequency').textContent = s.logs.length + ' ' + (s.logs.length === 1 ? 'registro realizado' : 'registros realizados');
  $('level-progress').style.width = (s.earned % 200) / 2 + '%';
  $('progress-label').textContent = 'Faltam ' + (200 - (s.earned % 200)) + ' pontos para o próximo nível';

  const achievements = [
    ['Primeiro passo', 'Faça seu primeiro registro', 'footprints', s.logs.length >= 1],
    ['Separador dedicado', 'Realize 5 registros', 'recycle', s.logs.length >= 5],
    ['Peso verde', 'Recicle 10 kg no total', 'scale', s.weight >= 10],
    ['Herói do bairro', 'Alcance 500 pontos', 'trophy', s.earned >= 500]
  ];

  $('achievements').innerHTML = achievements
    .map(
      ([title, desc, icon, won]) =>
        `<article class="badge card ${won ? 'unlocked' : 'locked'}">
          <div class="badge-icon"><i data-lucide="${icon}"></i></div>
          <h3>${title} ${won ? '✓' : ''}</h3>
          <p>${desc}</p>
        </article>`
    )
    .join('');

  const recent = [...records]
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    .slice(0, 5);

  $('activity-list').innerHTML = recent.length
    ? recent
        .map(r => {
          let recycle = r.tipo === 'reciclagem';
          return `<div class="activity-item">
            <span class="activity-icon"><i data-lucide="${recycle ? 'recycle' : 'ticket'}"></i></span>
            <span>
              <strong>${recycle ? escapeHTML(r.material) : 'Voucher · ' + (names[r.voucher_id] || 'Parceiro')}</strong>
              <small>${recycle ? format.format(Number(r.quantidade_kg)) + ' kg · ' : ''}${new Date(r.criado_em).toLocaleDateString('pt-BR')}</small>
            </span>
            <b>${recycle ? '+' : '−'}${format.format(Number(r.pontos))} pts</b>
          </div>`;
        })
        .join('')
    : '<div class="empty">Seu primeiro registro aparecerá aqui. Vamos começar?</div>';

  const vouchers = records
    .filter(r => r.tipo === 'resgate')
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

  $('voucher-list').innerHTML = vouchers
    .map(
      (r, i) =>
        `<span class="voucher-chip">🎟 ${names[r.voucher_id] || 'Parceiro'} · voucher demonstrativo #${String(vouchers.length - i).padStart(3, '0')}</span>`
    )
    .join('');

  document.querySelectorAll('.redeem').forEach(b => {
    b.disabled = busy || balance < costs[b.dataset.voucher];
    b.title = balance < costs[b.dataset.voucher] ? 'Pontos insuficientes' : '';
  });

  updateEstimate();
  if (window.lucide) lucide.createIcons();
}

function escapeHTML(text) {
  return String(text || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function message(id, text, error = false) {
  const el = $(id);
  el.textContent = text;
  el.className = 'message ' + (error ? 'error' : 'success');
}

function save(record, button, messageId, success) {
  busy = true;
  button.disabled = true;
  const previous = button.innerHTML;
  button.textContent = 'Salvando...';

  try {
    if (records.length >= 999) {
      message(messageId, 'Limite de 999 registros atingido.', true);
      return;
    }
    records.push(record);
    persistRecords(records);
    message(messageId, success);
    if (record.tipo === 'reciclagem') $('recycle-form').reset();
  } catch (e) {
    message(messageId, 'Não foi possível salvar. Tente novamente.', true);
  } finally {
    busy = false;
    button.innerHTML = previous;
    render();
  }
}

$('recycle-form').addEventListener('submit', e => {
  e.preventDefault();
  if (busy) return;

  const raw = String($('quantity').value).replace(',', '.');
  const kg = Number(raw);
  const material = $('material').value;

  if (!material || !Number.isFinite(kg) || kg < 0.1 || kg > 500) {
    message('form-message', 'Selecione um material e informe entre 0,1 e 500 kg.', true);
    return;
  }

  save(
    {
      tipo: 'reciclagem',
      material,
      quantidade_kg: kg,
      pontos: calculatePoints(kg),
      voucher_id: '',
      criado_em: new Date().toISOString()
    },
    $('submit-recycle'),
    'form-message',
    'Reciclagem registrada! Seus pontos foram adicionados.'
  );
});

$('quantity').addEventListener('input', updateEstimate);

document.querySelectorAll('.redeem').forEach(button =>
  button.addEventListener('click', () => {
    const id = button.dataset.voucher;
    if (busy || stats().earned - stats().spent < costs[id]) return;

    save(
      {
        tipo: 'resgate',
        material: '',
        quantidade_kg: 0,
        pontos: costs[id],
        voucher_id: id,
        criado_em: new Date().toISOString()
      },
      button,
      'voucher-message',
      'Voucher demonstrativo resgatado! Ele aparece abaixo.'
    );
  })
);

render();

const route = [
  [-23.5596, -46.6580],
  [-23.5581, -46.6562],
  [-23.5568, -46.6543],
  [-23.5551, -46.6528],
  [-23.5535, -46.6511],
  [-23.5521, -46.6495],
  [-23.5507, -46.6479],
  [-23.5492, -46.6462]
];

if (window.L) {
  const map = L.map('map', { scrollWheelZoom: false }).setView([-23.5546, -46.6520], 14);
  map.attributionControl.setPrefix(false);

  L.tileLayer('https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd'
  }).addTo(map);

  L.circleMarker(route[route.length - 1], {
    radius: 8,
    color: '#fff',
    weight: 3,
    fillColor: '#f1a74c',
    fillOpacity: 1
  })
    .addTo(map)
    .bindPopup('Ponto de chegada simulado');

  const truckIcon = L.divIcon({
    className: '',
    html: '<div class="truck-marker"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg></div>',
    iconSize: [39, 39],
    iconAnchor: [19, 19]
  });

  let step = 0;
  const marker = L.marker(route[0], { icon: truckIcon }).addTo(map).bindPopup('Caminhão simulado');

  function advance() {
    step = (step + 1) % route.length;
    marker.setLatLng(route[step]);
    const remaining = route.length - 1 - step;
    const km = (remaining * 0.35).toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });

    $('truck-distance').innerHTML = km + ' km <small>de distância estimada</small>';
    $('truck-status').textContent =
      remaining === 0 ? 'Chegada simulada' : remaining <= 2 ? 'Chegando à região' : 'Em rota de coleta';
    $('arrival-alert').textContent =
      remaining === 0
        ? 'Alerta simulado: o caminhão chegou ao ponto demonstrativo.'
        : remaining <= 2
        ? 'Alerta simulado: o caminhão está chegando! Cerca de ' + remaining * 2 + ' minutos.'
        : 'Estimativa simulada: aproximadamente ' + remaining * 2 + ' minutos até a chegada.';
    $('arrival-alert').classList.toggle('urgent', remaining <= 2);
  }

  $('advance-truck').addEventListener('click', advance);
  setInterval(advance, 5000);
}
