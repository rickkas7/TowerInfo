# Tower Info

Tower Info is a tool to show the location of nearby cellular towers on a mobile device, tablet, or laptop. It uses a Boron 2G/3G to scan for towers and communicates with the device using Web BLE (Bluetooth).

### The Tower Scanner

The tower scanner can only be a Boron 2G/3G. The Boron LTE doesn't support scanning for towers. The Electron and E Series don't support BLE to connect to the mobile device or laptop.

Because it uses a Boron 2G/3G it can only see 2G/3G towers. It can't see LTE towers, so it can't see Verizon in the United States, for example.

The tower scanner runs in manual mode with only the modem turned on and receiving requests by BLE. It does not make a cloud connection so it can be used to help troubleshoot connectivity issues.

The firmware can be found in the **src** directory in the Github repository in the **TowerInfo.cpp** file. 

It depends on two libraries. If you are using Particle Workbench, copy and paste this into your project.properties file.

```
dependencies.CellularHelper=0.0.7
dependencies.JsonParserGeneratorRK=0.1.0
```

Or, if you want to use the Web IDE, you can click on [this link](https://go.particle.io/shared_apps/5d94ce535cdabc0023dd6f58) to clone the project.

Since the firmware uses MANUAL mode with cellular on it with breathe dark blue. This is normal.

To put regular firmware on it again, put the device in safe mode (breathing magenta) or flash tinker or your own code over USB.

### The Tower Display

The display program is a web page that uses Web BLE. The selection of browsers that support Web BLE is limited:

- Chrome on Android
- Chrome on Chromebooks
- Chrome on some Macs
- Chrome on some Windows PCs
- The **WebBLE** iOS app for iPhone and iPad.

It does not work on other browser like Firefox, Safari, Edge, and Internet Explorer. 

It might work on Opera for Mac, Windows, Linux and Android. 

The display page uses WebBLE to communicate directly with the Boron 2G/3G. It renders the data using Vue JS and makes calls to Google Geolocation and Google Maps from the Javascript. The mobile device, tablet, or laptop must have a working Internet connection while scanning.

The sample is available at the Github pages site: 
xxx

- Load the firmwire above on your Boron. It should breathe dark blue.
- Just navigate to this page on your mobile device, tablet, or laptop.
- Click the **Start** button.
- Select the Boron from the dialog.
- Wait for the results to come in! It takes about 2 minutes.

### The Tower Web Page Server

If you want to fork the server code and run it locally, you need to be able to serve it using a https (TLS/SSL) server. Web BLE only works from https pages, not unencrypted pages.

The server is a static HTML/Javascript/css site and can run on any web serve. You probably won't be able to make it work with file:/// URLs.

You must set a Google Maps and Google Geolocation [API key](https://developers.google.com/maps/documentation/javascript/get-api-key) in the server code. The one embedded in the Github pages site only works on that site. It's in the main.js file, replace this:

```
const apiKey = 'PASTE_GOOGLE_API_KEY_HERE';
```

Be sure to include all four files:

- index.html 
- main.css
- main.js
- mccmnc.json

The .json file is the database that maps the MCC and MNC (tower identifiers) to operator names.

### mccmnc-parser

The mccmnc.json file is generated from the web site http://mccmnc.com. The node.js app in the mccmnc-parser is used to scrape the data from that page and save it in the JSON file. You should not need to do this as the built file is checked in and it doesn't change that often.
 