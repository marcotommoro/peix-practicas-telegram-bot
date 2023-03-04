const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');
const jsdom = require('jsdom');
const cron = require('node-cron');
require('dotenv').config();

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const API_TOKEN = process.env.API_TOKEN;
const CHAT_ID = '@practicasupv';

const main = async () => {
  const { data } = await axios.get(
    'https://intranet.inf.upv.es/int/aplic_intranet/peixboot/alumnos/listado_ofertas_5_detalle.php',
  );

  const dom = parseHtmlString(data);
  const offers = dom.querySelectorAll('.div_lista_ofertas');

  for (let i = 0; i < offers.length; i++) {
    console.log(`Offer ${i + 1} of ${offers.length}`);
    const offerData = await getData(offers[i]);
    const exists = await checkIfOfferExists(offerData.code);
    if (exists) continue;
    console.log('New offer found: ', offerData.code);
    await db.collection('offers').doc(offerData.code).set(offerData);
    await sendText(offerData);
    await sleep(2000);
    if (i % 10 === 0) await sleep(10000);
  }
};

const parseHtmlString = (htmlString) => {
  return new jsdom.JSDOM(htmlString, {
    contentType: 'text/html',
    includeNodeLocations: true,
  }).window.document;
};

const getData = async (offer) => {
  const code = offer.querySelector('input[name="codigo_oferta"]').value;
  const title = offer.querySelector('input[name="tareas"]').value;
  const empresa = offer.querySelector('input[name="nombre_emp"]').value;

  const timeDiff = offer
    .querySelectorAll('.h5_ofertas')[0]
    .textContent.trim()
    .replace('Hace: ', '')
    .replace(' día', '')
    .replace('s', '')
    .trim();

  const time = `Publicado: ${new Date(
    new Date() - timeDiff * 24 * 60 * 60 * 1000,
  ).toLocaleDateString()}`;

  const salary = offer.querySelectorAll('.h5_ofertas')[1].textContent.trim();

  const details = offer
    .querySelector('.detalle-oferta')
    .querySelectorAll('.row');

  const description = details[0].querySelectorAll('div')[1].textContent.trim();

  const profile = details[1].querySelectorAll('div')[1].textContent.trim();
  const duration = details[2].querySelectorAll('div')[1].textContent.trim();
  const startDate = details[3].querySelectorAll('div')[1].textContent.trim();

  return {
    code,
    title,
    empresa,
    time,
    salary,
    description,
    profile,
    duration,
    startDate,
  };
};

const checkIfOfferExists = async (code) => {
  const docRef = db.collection('offers').doc(code);
  const doc = await docRef.get();

  return doc.exists;
};

const sendText = async (offer) => {
  let text = `*${offer.title}*%0A%0A`;
  text += `*${offer.salary}*%0A`;
  text += `${offer.time}%0A%0A`;

  text += `Donde: ${offer.empresa}%0A%0A`;

  text += `*Descripción:*%0A${offer.description}%0A%0A`;

  text += `*Perfil:*%0A${offer.profile}%0A%0A`;
  text += `*Duración:*%0A${offer.duration}%0A%0A`;
  text += `*Fecha de inicio:*%0A${offer.startDate}%0A%0A`;
  text +=
    'consultar en https://intranet.inf.upv.es/int/aplic_intranet/peixboot/alumnos/listado_ofertas_5_detalle.php';

  const urlString = `https://api.telegram.org/bot${API_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${text}&parse_mode=markdown`;

  try {
    await axios.get(urlString);
  } catch (error) {
    console.error('Error sending message: ', error);
  }
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

main();
// Run every hour
cron.schedule('0 * * * *', () => {
  main();
});
