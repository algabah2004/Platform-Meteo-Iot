#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include "credentials.h" // Contient WIFI_SSID et WIFI_PASSWORD

// Configurations des broches
#define DHTPIN 4
#define DHTTYPE DHT11
#define TRIG_PIN 5
#define ECHO_PIN 18
#define LED_PIN 2

const char* DEVICE_ID = "ESP32_STATION_01";
const char* SERVER_DATA_URL = "http://192.168.244.140:8000/data"; 
const char* SERVER_CMD_URL = "http://192.168.244.140:8000/command?device_id=ESP32_STATION_01";

const float TANK_EMPTY_DISTANCE_CM = 20.0; // Distance capteur -> fond du bidon
const float TANK_FULL_DISTANCE_CM = 2.0;   // Distance minimale fiable du HC-SR04
const float WATER_ALERT_THRESHOLD = 30.0;  // LED allumee si niveau <= 30%

DHT dht(DHTPIN, DHTTYPE);
unsigned long lastDataSend = 0;
unsigned long lastCmdCheck = 0;
bool waterAlertActive = false;

void setup() {
    Serial.begin(115200);
    dht.begin();
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    pinMode(LED_PIN, OUTPUT);

    // Connexion Wi-Fi
    Serial.print("Connexion a ");
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWi-Fi Connecte !");
    Serial.print("Adresse IP ESP32 : ");
    Serial.println(WiFi.localIP());
}

float getDistance() {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long duree = pulseIn(ECHO_PIN, HIGH, 30000);
    float distance = duree * 0.034 / 2;
    return (distance == 0 || distance > 400) ? -1 : distance;
}

float calculateWaterLevel(float distanceCm) {
    if (distanceCm < 0) {
        return -1;
    }

    float usableHeight = TANK_EMPTY_DISTANCE_CM - TANK_FULL_DISTANCE_CM;
    float level = ((TANK_EMPTY_DISTANCE_CM - distanceCm) / usableHeight) * 100.0;

    if (level < 0) level = 0;
    if (level > 100) level = 100;
    return level;
}

void loop() {
    unsigned long currentMillis = millis();

    // 1. Envoi des données toutes les 10 secondes
    if (currentMillis - lastDataSend >= 2000) {
        lastDataSend = currentMillis;

        if (WiFi.status() == WL_CONNECTED) {
            HTTPClient http;
            http.begin(SERVER_DATA_URL);
            http.addHeader("Content-Type", "application/json");

            float h = dht.readHumidity();
            float t = dht.readTemperature();
            float dist = getDistance();
            float niveau_eau = calculateWaterLevel(dist);
            if (niveau_eau < 0) niveau_eau = 0;

            waterAlertActive = niveau_eau <= WATER_ALERT_THRESHOLD;
            digitalWrite(LED_PIN, waterAlertActive ? HIGH : LOW);

            if (!isnan(h) && !isnan(t)) {
                String jsonPayload = "{\"device_id\":\"" + String(DEVICE_ID) + 
                                     "\",\"temperature\":" + String(t) + 
                                     ",\"humidity\":" + String(h) + 
                                     ",\"water_level\":" + String(niveau_eau) + "}";

                int httpResponseCode = http.POST(jsonPayload);
                Serial.print("Distance eau: ");
                Serial.print(dist);
                Serial.print(" cm | Niveau: ");
                Serial.print(niveau_eau);
                Serial.print("% | Alerte LED: ");
                Serial.print(waterAlertActive ? "ON" : "OFF");
                Serial.print(" | HTTP: ");
                Serial.println(httpResponseCode);
            }
            http.end();
        }
    }

    // 2. Vérification des commandes toutes les 5 secondes
    if (currentMillis - lastCmdCheck >= 1000) {
        lastCmdCheck = currentMillis;

        if (WiFi.status() == WL_CONNECTED) {
            HTTPClient http;
            http.begin(SERVER_CMD_URL);
            int httpResponseCode = http.GET();

            if (httpResponseCode == 200) {
                String payload = http.getString();
                Serial.print("Commande recue : ");
                Serial.println(payload);

                if (waterAlertActive) {
                    digitalWrite(LED_PIN, HIGH);
                } else if (payload.indexOf("LED_ON") >= 0) {
                    digitalWrite(LED_PIN, HIGH);
                } else if (payload.indexOf("LED_OFF") >= 0) {
                    digitalWrite(LED_PIN, LOW);
                }
            }
            http.end();
        }
    }
}
