import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    # Firebase Configuration
    FIREBASE_CREDENTIALS = "serviceAccountKey.json"
    FIREBASE_DATABASE_URL = os.getenv('FIREBASE_DATABASE_URL')
    
    # MQTT Broker Configuration
    MQTT_BROKER = os.getenv('MQTT_BROKER', 'broker.hivemq.com')
    MQTT_PORT = 1883
    MQTT_TOPIC_BINS = "waste/bin/+/data"
    MQTT_TOPIC_VEHICLES = "vehicle/+/location"
    
    # Google Maps API
    GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY')
    
    # Application Settings
    FILL_THRESHOLD = 70  # Percentage threshold for collection
    FLASK_HOST = '0.0.0.0'
    FLASK_PORT = 5000
    DEBUG = True