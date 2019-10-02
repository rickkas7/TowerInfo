
let decoder = new TextDecoder('utf-8')

const serviceUuid = '378a36ab-1a74-4b28-a2da-c9e3e96affed';
const responseUuid = 'ec119123-1b3d-4a28-b4b5-64db46f0da69';
const commandUuid = 'fa7fbdf6-e86a-461c-9eb8-78af97e2d73c';

// This is the Google API key for Maps and Geolocation. See:
// https://developers.google.com/maps/documentation/javascript/get-api-key
// Make sure you enable both Maps and Geolocation APIs and enable billing 
// for your project.
const apiKey = 'PASTE_GOOGLE_API_KEY_HERE';

let mccmncData = [];

let map;
let curTowerColorIndex = 0;
let progressTimer;
let scanStartTime = 0;

const towerColors = [
	'#000040',
	'#004000',
	'#400000',
	'#004040',
	'#404000',
	'#400040',
	'#404040'
];

Vue.component('demo-grid', {
	  template: '#grid-template',
	  props: {
	    table: Array,
	    columns: Array
	  },
	  data: function () {
		  return {};
	  },
	  computed: {
	  },
	  filters: {
	    capitalize: function (str) {
	      return str.charAt(0).toUpperCase() + str.slice(1)
	    }
	  },
	  methods: {
	  }
	})

var app = new Vue({
	el: '#app',
    created() {
        this.fetchOperatorData();	
        window.addEventListener("orientationchange", this.resizeWindow);
        window.addEventListener("resize", this.resizeWindow);
        this.resizeWindow();
        
        // Insert this from Javascript so the key only need to be changed once
        // apiKey is used by both maps and geolocation.
        var s = document.createElement('script');
        s.setAttribute('src', 'https://maps.googleapis.com/maps/api/js?key=' + apiKey);
        s.async = true;
        document.body.appendChild(s);
    },
    data: {
    	table: [],
    	tableColumns: [],
    	tableColumnsNarrow: ['label', 'carrier', 'band', 'rssi'],
    	tableColumnsWide: ['label', 'carrier', 'band', 'rssi', 'location', 'accuracy'],
    	status: '',
    	progress: 0,
    	maxProgress: 125,
    	hasBrowserBLE: true,
    	showStart: true,
    	mapStyle: { width:'100%', height:'800px' }
    },
    methods: {
    	fetchOperatorData() {
	        axios.get('mccmnc.json').then(response => {
	        	mccmncData = response.data;
	            
	            // console.log("operatorData", mccmncData);
	        	
	        });
        },
        startHandler() {
        	if (navigator.bluetooth) {
        		startConnection();
        	}
        	else {
        		this.showStart = false;
        		this.hasBrowserBLE = false;
        	}

        },
        resizeWindow() {        	
        	const mapHeight = Math.floor(innerHeight * 0.8);
        	this.mapStyle.height = mapHeight + 'px';
        	// this.status = 'height set to ' + mapHeight;
        	
        	if (innerWidth < 500) {
        		this.tableColumns = this.tableColumnsNarrow;
        	}
        	else {
        		this.tableColumns = this.tableColumnsWide;        		
        	}
        }
    }
});

async function startConnection() {
	try {
		app.status = 'Select Boron...';
		
		app.showStart = false;
		
		// console.log('requesting bluetooth device...');
		const device = await navigator.bluetooth.requestDevice({
			filters: [{services: [serviceUuid]}]});

		device.addEventListener('gattserverdisconnected', onDisconnected);
		
		app.status = 'Connecting...';
		
		const server = await device.gatt.connect();

		app.status = 'Connected!';

		const service = await server.getPrimaryService(serviceUuid);

		const responseCharacteristic = await service.getCharacteristic(responseUuid);

		await responseCharacteristic.startNotifications();

		responseCharacteristic.addEventListener('characteristicvaluechanged', handleResponseNotifications);

		app.status = 'Scaning for towers (takes about 2 minutes)...';
		
		scanStartTime = new Date().getTime();
		progressTimer = setInterval(function() {
			let elapsedSecs = Math.floor((new Date().getTime() - scanStartTime) / 1000);
			if (elapsedSecs > app.maxProgress) {
				elapsedSecs = app.maxProgress;
			}
			app.progress = elapsedSecs;
		}, 2000);

	} catch(error) {
		console.log('error: ' + error);
		app.status = error;
		app.showStart = true;
	}
}

function onDisconnected() {
	app.status = 'Boron disconnected';
	app.showStart = true;
}

function handleResponseNotifications(event) {
	// value are in signed 32-bit floats in little endian byte order (true)
	// Adafruit unified sensor library outputs degrees
	// var x = event.target.value.getFloat32(0, true);
	
	// console.log('value=', event.target.value);
	
	// console.log('handleResponseNotifications ' + decoder.decode(event.target.value.buffer));

	try {
		var json = JSON.parse(decoder.decode(event.target.value.buffer));
		
		switch(json.op) {
		case 'tower':
			handleTower(json);
			break;
			
		case 'status':
			// console.log("received status " + json.msg);
			app.status = json.msg;
			break;
			
		case 'done':
			app.status = 'scan complete!';
			app.progress = app.maxProgress;
			
			if (progressTimer) {
				clearInterval(progressTimer);
			}
			
			// console.log('table', app.table);
			break;
			
		default:
			break;
		}
	}
	catch(e) {
		console.log('parsing exception', e);
	}
}

function handleTower(data) {
	var carrier = lookupCarrier(data.mcc, data.mnc);

	// console.log('mcc=' + data.mcc + ' mnc=' + data.mnc + ' carrier=' + carrier);

	let req = {};

	req.considerIp = false;
	if (carrier) {
		req.carrier = carrier;
	}
	req.cellTowers = [];

	let tower = {};
	tower.cellId = data.ci;
	tower.locationAreaCode = data.lac;
	tower.mobileCountryCode = data.mcc;
	tower.mobileNetworkCode = data.mnc;
	tower.signalStrength = data.rssi;

	req.cellTowers.push(tower);

	let url = 'https://www.googleapis.com/geolocation/v1/geolocate?key=' + apiKey;

	let reqData = JSON.stringify(req);

	// console.log('reqData=' + reqData);

	let opts = {
			headers: {
				'Content-Type': 'application/json',
			}
	};

	axios.post(url, reqData, opts).then(response => {

		if (response.status == 200) {
			// console.log('response data', response.data);

			const band = getBandName(data);
			
			const locStr = response.data.location.lat.toFixed(7) + ', ' + response.data.location.lng.toFixed(7);
			
			const label = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'.charAt(app.table.length);
			
			app.table.push({label:label, carrier:carrier, rssi:data.rssi, location:locStr, accuracy:response.data.accuracy, band:band});
			
			const loc = new google.maps.LatLng(response.data.location.lat, response.data.location.lng);
			
			if (!map) {
				var mapProp= {
						center:loc,
						zoom:13,
				};
				map = new google.maps.Map(document.getElementById("googleMap"), mapProp);
			}
			
			let towerCircle = new google.maps.Circle({
				  center:loc,
				  radius:response.data.accuracy,
				  strokeColor:towerColors[curTowerColorIndex],
				  strokeOpacity:0.2,
				  strokeWeight:0.5,
				  fillColor:towerColors[curTowerColorIndex],
				  fillOpacity:0.1,
				  map:map
			});
			
			if (++curTowerColorIndex >= towerColors.length) {
				curTowerColorIndex = 0;
			}
			const title = carrier + ' ' + band + ' (' + data.rssi + ' dB)';
			
			let marker = new google.maps.Marker({position:loc, map:map, title:title, label:label});
			
		}
		else {
			console.log('tower lookup failed ' + response.status);
		}

	});

}

function lookupCarrier(mcc, mnc) {
	// [{"mcc":"289","mnc":"88","iso":"ge","country":"Abkhazia","name":"A-Mobile"},{"mcc":"289","mnc":"68","iso":"ge","country":"Abkhazia","name":"A-Mobile"},...
		
	for(let ii = 0; ii < mccmncData.length; ii++) {
		// Note: mcc and mnc in the array are strings to make sure this is not an === test!
		if (mccmncData[ii].mcc == mcc && mccmncData[ii].mnc == mnc) {
			return mccmncData[ii].name;
		}
	}
	return '';
}


function getFreq(data) {
	var freq = 0;

	if (data['ulf']) {
		// 3G radio

		// There are a bunch of special cases:
		switch(data.ulf) {
		case 12:
		case 37:
		case 62:
		case 87:
		case 112:
		case 137:
		case 162:
		case 187:
		case 212:
		case 237:
		case 262:
		case 287:
			freq = 1900; // PCS A-F
			break;

		case 1662:
		case 1687:
		case 1712:
		case 1737:
		case 1762:
		case 1787:
		case 1812:
		case 1837:
		case 1862:
			freq = 1700; // AWS A-F
			break;

		case 782:
		case 787:
		case 807:
		case 812:
		case 837:
		case 862:
			freq = 850; // CLR
			break;

		case 2362:
		case 2387:
		case 2412:
		case 2437:
		case 2462:
		case 2487:
		case 2512:
		case 2537:
		case 2562:
		case 2587:
		case 2612:
		case 2637:
		case 2662:
		case 2687:
			freq = 2600; // IMT-E
			break;

		case 3187:
		case 3212:
		case 3237:
		case 3262:
		case 3287:
		case 3312:
		case 3337:
		case 3362:
		case 3387:
		case 3412:
		case 3437:
		case 3462:
			freq = 1700; // EAWS A-G
			break;

		case 3707:
		case 3732:
		case 3737:
		case 3762:
		case 3767:
			freq = 700; // LSMH A/B/C
			break;

		case 3842:
		case 3867:
			freq = 700; // USMH C
			break;

		case 3942:
		case 3967:
			freq = 700; // USMH D

		case 387:
		case 412:
		case 437:
			freq = 800;
			break;

		case 6067:
		case 6092:
		case 6117:
		case 6142:
		case 6167:
		case 6192:
		case 6217:
		case 6242:
		case 6267:
		case 6292:
		case 6317:
		case 6342:
		case 6367:
			freq = 1900; // EPCS A-G
			break;

		case 5712:
		case 5737:
		case 5762:
		case 5767:
		case 5787:
		case 5792:
		case 5812:
		case 5817:
		case 5837:
		case 5842:
		case 5862:
			freq = 850; // ECLR
			break;

		default:
			if (data.ulf >= 0 && data.ulf <= 124) {
				freq = 900;
			}
			else
			if (data.ulf >= 128 && data.ulf <= 251) {
				freq = 850;
			}
			else
			if (data.ulf >= 512 && data.ulf <= 885) {
				freq = 1800;
			}
			else
			if (data.ulf >= 975 && data.ulf <= 1023) {
				freq = 900;
			}
			else
			if (data.ulf >= 1312 && data.ulf <= 1513) {
				freq = 1700;
			}
			else
			if (data.ulf >= 2712 && data.ulf <= 2863) {
				freq = 900;
			}
			else
			if (data.ulf >= 4132 && data.ulf <= 4233) {
				freq = 850;
			}
			else
			if ((data.ulf >= 4162 && data.ulf <= 4188) || (data.ulf >= 20312 && data.ulf <= 20363)) {
				freq = 800;
			}
			else
			if (data.ulf >= 9262 && data.ulf <= 9538) {
				freq = 1900;
			}
			else
			if (data.ulf >= 9612 && data.ulf <= 9888) {
				freq = 2100;
			}
			break;
		}


	}
	else {
		// 2G, use data.arfcn
		if (data.arfcn >= 0 && data.arfcn <= 124) {
			freq = 900;
		}
		else
		if (data.arfcn >= 128 && data.arfcn <= 251) {
			freq = 850;
		}
		else
		if (data.arfcn >= 512 && data.arfcn <= 885) {
			freq = 1800;
		}
		else
		if (data.arfcn >= 975 && data.arfcn <= 1023) {
			freq = 900;
		}
	}
	return freq;
}

function getBandName(data) {
	let band;

	let freq = getFreq(data);
	
	if (freq === 1800) {
		switch(data.mcc) {
		case 310:
			// Expand this to include more countries that use 1900 MHz instead of 1800 MHz
			freq = '1900 MHz';
			break;
			
		default:
			dcs = '1800/1900 MHz';
			break;
		}
	}
	else
	if (freq === 0) {
		freq = 'unknown';
	}	
	else {
		freq = freq.toString() + ' MHz';
	}
	
	if (data['ulf']) {
		// 3G radio
		band = '3G ' + freq;
	}
	else {
		band = '2G ' + freq;		
	}

	return band;
}

