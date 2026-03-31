const express = require('express');
const cors = require('cors');
const { Redis } = require('@upstash/redis');

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const PIN = () => process.env.PIN_ADMIN || '1234';

const K = {
  polizas:   'adm:polizas',
  facturas:  'adm:facturas',
  movBanco:  'adm:movbanco',
  cortes:    'adm:cortes',
  catalogo:  'adm:catalogo',
  cfg:       'adm:cfg',
  ts:        'adm:lastUpdate',
};

// ── Cargar todos los datos ──
app.get('/api/datos', async (req, res) => {
  try {
    const [polizas, facturas, movBanco, cortes, catalogo, cfg] = await Promise.all([
      kv.get(K.polizas),
      kv.get(K.facturas),
      kv.get(K.movBanco),
      kv.get(K.cortes),
      kv.get(K.catalogo),
      kv.get(K.cfg),
    ]);
    res.json({
      polizas:  polizas  || [],
      facturas: facturas || [],
      movBanco: movBanco || [],
      cortes:   cortes   || [],
      catalogo: catalogo || null,
      cfg: cfg || {
        empresa: 'INSTINTO',
        rfc: 'AHU2503187D7',
        ejercicio: new Date().getFullYear(),
        tasaMIFEL: 0.008,
        ivaComision: 0.16,
        tasaCASH: 0.058,
        preciosConIVA: true,
      },
    });
  } catch (e) {
    console.error('/api/datos', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Guardar todos los datos ──
app.post('/api/guardar', async (req, res) => {
  try {
    const { polizas, facturas, movBanco, cortes, catalogo, cfg } = req.body;
    await Promise.all([
      kv.set(K.polizas,  polizas  || []),
      kv.set(K.facturas, facturas || []),
      kv.set(K.movBanco, movBanco || []),
      kv.set(K.cortes,   cortes   || []),
      kv.set(K.catalogo, catalogo || null),
      kv.set(K.cfg,      cfg      || {}),
      kv.set(K.ts,       Date.now()),
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('/api/guardar', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Timestamp sync ──
app.get('/api/lastUpdate', async (req, res) => {
  try {
    const ts = await kv.get(K.ts);
    res.json({ ts: ts || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PIN verify ──
app.post('/api/pin', (req, res) => {
  const { pin } = req.body || {};
  res.json({ ok: pin === PIN() });
});

module.exports = app;
