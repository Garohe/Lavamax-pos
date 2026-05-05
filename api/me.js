const { extractUser } = require('../lib/auth');

module.exports = async (req, res) => {
  const user = extractUser(req);
  if (!user) return res.json({ autenticado: false });
  res.json({ autenticado: true, nombre: user.nombre, rol: user.rol });
};
