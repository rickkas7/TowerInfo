#include "Particle.h"

#include "CellularHelper.h"
#include "JsonParserGeneratorRK.h"

// Only works on Boron 2G/3G
// It won't work on the Electron/E Series because it requires BLE, which is only on Gen 3
// It won't work on LTE devices (Boron LTE, B Series B402 SoM) because the u-blox SARA-R410M-02B does not support
// tower detection using AT+CGED=5.

SYSTEM_MODE(MANUAL);
SYSTEM_THREAD(ENABLED);

SerialLogHandler logHandler;

const unsigned long MODEM_ON_WAIT_TIME_MS = 4000;


// Forward declarations
void cellularScan();
void bleCommandReceived(const uint8_t* data, size_t len, const BlePeerDevice& peer, void* context);
void buttonHandler(system_event_t event, int data);
void sendResponse(const char *op, const char *fmt = NULL, ...);

const BleUuid serviceUuid("378a36ab-1a74-4b28-a2da-c9e3e96affed");
const BleUuid responseUuid("ec119123-1b3d-4a28-b4b5-64db46f0da69");
const BleUuid commandUuid("fa7fbdf6-e86a-461c-9eb8-78af97e2d73c");

BleCharacteristic responseCharacteristic("response", BleCharacteristicProperty::NOTIFY, responseUuid, serviceUuid);
BleCharacteristic commandCharacteristic("command", BleCharacteristicProperty::WRITE, commandUuid, serviceUuid, bleCommandReceived, NULL);


enum State {
	STARTUP_STATE,
	RUN_TEST_STATE,
	DONE_STATE,
	IDLE_WAIT_STATE
};
State state = STARTUP_STATE;
unsigned long stateTime = 0;
bool buttonClicked = false;
bool wasConnected = false;

// Global parser that supports up to 256 bytes of data and 20 tokens
JsonParserStatic<256, 20> parser;

// Global JSON writer
JsonWriterStatic<256> jw;

class CustomResponse : public CellularHelperEnvironmentResponseStatic<32> {
public:
	CustomResponse();
	virtual ~CustomResponse();

	// Override
	virtual int parse(int type, const char *buf, int len);

	int lastCurDataIndex = -1;
};

CustomResponse envResp;

void setup() {
	Serial.begin(9600);
	System.on(button_click, buttonHandler);

    BLE.addCharacteristic(responseCharacteristic);
    BLE.addCharacteristic(commandCharacteristic);

    BleAdvertisingData data;
    data.appendServiceUUID(serviceUuid);
    BLE.advertise(&data);

}

void loop() {
	switch(state) {
	case STARTUP_STATE:
		Log.info("turning on modem...");
		buttonClicked = false;
		Cellular.on();

		delay(MODEM_ON_WAIT_TIME_MS);

		Log.info("press the MODE button to start test");
		state = IDLE_WAIT_STATE;
		stateTime = millis();
		break;

	case RUN_TEST_STATE:
		cellularScan();
		state = DONE_STATE;
		break;

	case DONE_STATE:
		Log.info("tests complete!");
		Log.info("press the MODE button to repeat test");
		buttonClicked = false;
		state = IDLE_WAIT_STATE;
		break;

	case IDLE_WAIT_STATE:
		if (buttonClicked) {
			buttonClicked = false;
			state = RUN_TEST_STATE;
		}
		break;
	}

    if (BLE.connected()) {
    	if (!wasConnected) {
    		// The BLE central just connected

    		// If we're idle, start running the test
    		if (state == IDLE_WAIT_STATE) {
    			state = RUN_TEST_STATE;
    		}
    	}
    	wasConnected = true;
    }
    else {
    	wasConnected = false;
    }



}

void sendResponse(const char *op, const char *fmt, ...) {
	char msg[200];
	if (!BLE.connected()) {
		return;
	}
	if (fmt != NULL) {
		va_list ap;
		va_start(ap, fmt);
		vsnprintf(msg, sizeof(msg), fmt, ap);
		va_end(ap);
	}
	else {
		msg[0] = 0;
	}
	Log.info("op=%s msg=%s", op, msg);

	jw.init();
	{
		JsonWriterAutoObject obj(&jw);

		// Add various types of data
		jw.insertKeyValue("op", op);
		if (fmt != NULL) {
			jw.insertKeyValue("msg", msg);
		}
	}

	responseCharacteristic.setValue((const char *)jw.getBuffer());

}

void printCellData(CellularHelperEnvironmentCellData *data) {
	const char *whichG = data->isUMTS ? "3G" : "2G";

	// Log.info("mcc=%d mnc=%d", data->mcc, data->mnc);

	Log.info("%s %s %d bars (%03d%03d)", whichG, data->getBandString().c_str(), data->getBars(), data->mcc, data->mnc);
}

void cellularScan() {

	// envResp.enableDebug = true;
	envResp.clear();

	// Command may take up to 3 minutes to execute!
	envResp.resp = Cellular.command(CellularHelperClass::responseCallback, (void *)&envResp, 360000, "AT+COPS=5\r\n");
	if (envResp.resp == RESP_OK) {
		envResp.postProcess();
		envResp.logResponse();

		sendResponse("done");
	}

}

void bleCommandReceived(const uint8_t* data, size_t len, const BlePeerDevice& peer, void* context) {
    // Log.trace("Received data from: %02X:%02X:%02X:%02X:%02X:%02X:", peer.address()[0], peer.address()[1], peer.address()[2], peer.address()[3], peer.address()[4], peer.address()[5]);

    parser.clear();
    parser.addData((const char *)data, len);

    if (parser.parse()) {
    	String op = parser.getReference().key("op").valueString();

    	// Log.info("request parsed op=%s", op.c_str());

    	if (op.equals("scan")) {
    		if (state == IDLE_WAIT_STATE) {
        		Log.info("manual scan started");
    			state = RUN_TEST_STATE;
    		}
    		else {
        		Log.info("manual scan ignored (state = %d)", state);
    		}

    	}
    	else {
    		Log.info("unknown op=%s", op.c_str());
    	}
    }
    else {
    	Log.info("command did not parse successfully");
    }

}


void buttonHandler(system_event_t event, int param) {
	// int clicks = system_button_clicks(param);
	buttonClicked = true;
}

CustomResponse::CustomResponse() {
}

CustomResponse::~CustomResponse() {
}

int CustomResponse::parse(int type, const char *buf, int len) {
	int res = CellularHelperEnvironmentResponseStatic::parse(type, buf, len);

	if (curDataIndex != lastCurDataIndex) {
		lastCurDataIndex = curDataIndex;

		// A new environment record has been added
		Log.info("new tower found curDataIndex=%d", curDataIndex);

		CellularHelperEnvironmentCellData *cellData;
		if (curDataIndex == 0) {
			cellData = &service;
		}
		else {
			cellData = &neighbors[curDataIndex - 1];
		}

		if (cellData->isValid()) {
			// Found a valid looking record. If the signal is very weak the mcc, ci, and lac won't be filled in
			// and we can't use it for location.
			jw.init();
			{
				JsonWriterAutoObject obj(&jw);

				// Add various types of data
				jw.insertKeyValue("op", "tower");
				jw.insertKeyValue("mcc", cellData->mcc);
				jw.insertKeyValue("mnc", cellData->mnc);
				jw.insertKeyValue("lac", cellData->lac);
				jw.insertKeyValue("ci", cellData->ci);
				jw.insertKeyValue("rssi", cellData->getRSSI());

				if (cellData->isUMTS) {
					// 3G
					jw.insertKeyValue("ulf", cellData->ulf);
				}
				else {
					// 2G
					jw.insertKeyValue("arfcn", cellData->arfcn);
				}
			}

			Log.info("tower response: %s", jw.getBuffer());

			responseCharacteristic.setValue((const char *)jw.getBuffer());
		}
	}

	return res;
}


