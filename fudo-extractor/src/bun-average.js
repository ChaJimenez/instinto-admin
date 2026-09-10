require('dotenv').config();
const FudoClient = require('./fudo-client');

const DAYS = parseInt(process.argv[2] || '30', 10);

// Productos del menú de Instinto que llevan pan de hamburguesa, con panes por unidad.
// COMBO INSTINTO / COMBO PAREJA se excluyen: Fudo no expone qué burger llevan dentro
// del combo (sin desglose de submodificadores en la API), así que no se pueden contar
// sin adivinar.
const BUN_PRODUCTS = {
  'CHEESEBURGER CLÁSICA': 1,
  'DOBLE DOBLE': 1,
  'CRISPY CHICKEN HOT HONEY': 1,
  'VEGETARIANA': 1,
  '(Pack 10) Baby Burgers INSTINTO': 10,
};

function bunsPerUnit(name) {
  return BUN_PRODUCTS[name] || 0;
}

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  const today = new Date();
  const start = new Date(today.getTime() - DAYS * 24 * 60 * 60 * 1000);

  console.log(`Extrayendo ventas del ${fudo.formatDate(start)} al ${fudo.formatDate(today)}...`);
  const sales = await fudo.getSales(start, today);
  console.log(`Ventas encontradas: ${sales.length}`);

  const byDay = {};
  let totalBuns = 0;
  const productNamesSeen = new Set();

  sales.forEach((sale) => {
    if (!sale.createdAt) return;
    const day = sale.createdAt.split('T')[0];
    sale.items.forEach((item) => {
      if (item.canceled) return;
      const name = item.productName || '';
      const perUnit = bunsPerUnit(name);
      if (perUnit === 0) return;
      productNamesSeen.add(name);
      const buns = item.quantity * perUnit;
      byDay[day] = (byDay[day] || 0) + buns;
      totalBuns += buns;
    });
  });

  const days = Object.keys(byDay).sort();
  console.log('\nProductos identificados como hamburguesa:');
  [...productNamesSeen].forEach((n) => console.log(`  - ${n}`));

  console.log('\nPanes de hamburguesa por día:');
  days.forEach((d) => console.log(`  ${d}: ${byDay[d]}`));

  const daysWithSales = days.length;
  const avgOverDaysWithSales = daysWithSales > 0 ? totalBuns / daysWithSales : 0;
  const avgOverCalendarDays = totalBuns / DAYS;

  console.log(`\nTotal panes (${DAYS} días): ${totalBuns}`);
  console.log(`Promedio por día CON ventas (${daysWithSales} días): ${avgOverDaysWithSales.toFixed(1)}`);
  console.log(`Promedio por día calendario (${DAYS} días): ${avgOverCalendarDays.toFixed(1)}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
