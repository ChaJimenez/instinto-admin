require('dotenv').config();
const FudoClient = require('./fudo-client');

/**
 * Diagnóstico: ¿item.price en /sales items es precio UNITARIO o precio de
 * LÍNEA (ya multiplicado por cantidad)? Imprime cada línea de venta del
 * 9 de sept que sea Victoria Familiar, con su price/quantity crudos.
 *
 * Uso: node src/debug-item-price.js
 */

async function main() {
  const fudo = new FudoClient(
    process.env.FUDO_API_KEY,
    process.env.FUDO_API_SECRET,
    process.env.FUDO_BASE_URL || 'https://api.fu.do/v1alpha1'
  );

  const target = new Date('2026-09-09T12:00:00-06:00');
  const sales = await fudo.getSales(
    new Date(target.getTime() - 24 * 60 * 60 * 1000),
    new Date(target.getTime() + 24 * 60 * 60 * 1000)
  );

  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      if (item.productName.toUpperCase().includes('VICTORIA')) {
        console.log(
          `venta=${sale.id} producto="${item.productName}" price=${item.price} quantity=${item.quantity} ` +
          `price*quantity=${item.price * item.quantity} canceled=${item.canceled}`
        );
      }
    });
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
