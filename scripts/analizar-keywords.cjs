// Analizar keywords de peptidos-seo para elegir slugs en español (Solo lectura, imprime top).
const fs = require('fs');
const path = 'C:/Users/oband/Downloads/peptidos-seo/PALABRAS_ve_es.json';
const d = JSON.parse(fs.readFileSync(path, 'utf8'));
d.sort((a, b) => (b.volume || 0) - (a.volume || 0));
console.log('=== TOP 35 keywords por volumen (VE es) ===');
d.slice(0, 35).forEach((k) => console.log((k.volume || 0) + '\t' + (k.competition_level || '') + '\t' + k.text));
console.log('=== Categorías/tienda/buscar/faq keywords ===');
['peptido','comprar','tienda','catalogo','carrito','faq','precio','envio','coa','certificado','peptidos'].forEach((s) => {
  const hits = d.filter((k) => k.text.toLowerCase().includes(s)).sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,5);
  if (hits.length) { console.log('--' + s + '--'); hits.forEach((k) => console.log('  '+(k.volume||0)+'\t'+k.text)); }
});
