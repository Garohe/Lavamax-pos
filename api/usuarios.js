const bcrypt = require('bcryptjs');
const { getSQL } = require('../lib/db');
const { withAdmin } = require('../lib/auth');

async function handleGet(req, res) {
  const sql = getSQL();
  const rows = await sql`SELECT id, usuario, nombre, rol FROM usuarios ORDER BY nombre`;
  res.json(rows);
}

async function handlePost(req, res) {
  const { usuario, nombre, password, rol } = req.body;
  const sql = getSQL();

  const existing = await sql`SELECT id FROM usuarios WHERE usuario = ${usuario}`;
  if (existing.length > 0) return res.status(400).json({ error: 'Usuario ya existe' });

  const rows = await sql`INSERT INTO usuarios (usuario, nombre, password, rol)
    VALUES (${usuario}, ${nombre}, ${bcrypt.hashSync(password, 10)}, ${rol || 'empleado'})
    RETURNING id, usuario, nombre, rol`;

  res.json(rows[0]);
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return withAdmin(handleGet)(req, res);
  if (req.method === 'POST') return withAdmin(handlePost)(req, res);
  res.status(405).json({ error: 'Method not allowed' });
};
