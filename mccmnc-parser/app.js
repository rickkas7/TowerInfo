
const fs = require('fs');

const fetch = require('node-fetch');

const { JSDOM } = require('jsdom');
const unescape = require('lodash/unescape');


const url = 'http://mcc-mnc.com/';


async function doFetch(url) {
	const cache = 'no-cache';
	const headers = {
		'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
		'Accept-Encoding': 'gzip, deflate',
		'Accept-Language': 'en-US,en;q=0.9',
		'Cache-Control': 'max-age=0',
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36',
	};

	console.log('requesting page for scraping', { url, headers });

	const res = await fetch(url, { cache, headers });
	const { ok, headers: responseHeaders, redirected, status, statusText } = res;

	console.log('completed http request', { ok, responseHeaders, redirected, status, statusText });

	return await res.text();
};

async function doExtract(body) {
	const dom = new JSDOM(body);

	const tbody = dom.window.document.querySelector('#mncmccTable tbody');
	const { children } = tbody || {};

	if (tbody == null || children == null || !children.length) {
		throw new Error('Could not find HTMLTableSectionElement \'#mncmccTable tbody\', check if page has changed');
	}

	console.log(`found ${children.length} entries`);

	const entries = [];

	[...children].forEach(row => {
		const [mcc, mnc, iso, country, , name] = [...row.children].map(n => unescape(n.innerHTML.trim()));
		entries.push({ mcc, mnc, iso, country, name });
	});

	return entries;
};

async function run() {
	const raw = await doFetch(url);
	// const raw = fs.readFileSync('~/Desktop/view-source_mcc-mnc.com.html');
	// console.log("raw", raw);

	const rows = await doExtract(raw);
	// console.log("rows", rows);
	
	fs.writeFileSync('./mccmnc.json', JSON.stringify(rows));
}

run();

