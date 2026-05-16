from flask import Flask, jsonify, request
from flask_cors import CORS
from config import Config
from services.firebase_service import FirebaseService
from services.route_optimizer import RouteOptimizer
from twilio.rest import Client
from math import radians, sin, cos, sqrt, atan2
import threading
import time

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

firebase_service = FirebaseService(
    Config.FIREBASE_CREDENTIALS,
    Config.FIREBASE_DATABASE_URL
)

# ================= TWILIO CONFIG =================

account_sid = "ACbdf514c76f3b7cc2e085e9c1bfe17644"
auth_token = "2f8ee6b29987cf2e7ef777baa676487c"

client = Client(account_sid, auth_token)

ALERT_PHONE = "+919321454926"
TWILIO_PHONE = "+14789795186"


def send_sms_alert(bin_data):
    try:
        message = client.messages.create(
            body=f"""
🚨 Smart Waste Alert 🚨

Bin Name: {bin_data.get('binName')}
Location: {bin_data.get('address')}
Fill Level: {bin_data.get('currentFillLevel')}%

Immediate collection required.
""",
            from_=TWILIO_PHONE,
            to=ALERT_PHONE
        )
        print("SMS Sent:", message.sid)
    except Exception as e:
        print("SMS Error:", e)

# ================= BACKGROUND SMS MONITOR =================

def monitor_bins_for_sms():

    print("🔥 Background SMS Monitor Started")

    last_status = {}

    while True:
        try:
            bins = firebase_service.realtime_db.child("bins").get() or {}

            for bin_id, bin_data in bins.items():

                current_status = bin_data.get("status")
                fill_level = bin_data.get("currentFillLevel", 0)

                if bin_id not in last_status:
                    last_status[bin_id] = current_status
                    continue

                if (
                    last_status[bin_id] != "critical"
                    and current_status == "critical"
                    and fill_level >= 80
                ):
                    print(f"🚨 Real Sensor Triggered SMS for {bin_id}")
                    send_sms_alert(bin_data)

                last_status[bin_id] = current_status

        except Exception as e:
            print("Monitor Error:", e)

        time.sleep(5)

# ================= REAL GARBAGE CENTERS =================

GARBAGE_CENTERS = [
    {"name": "Uruli Devachi Landfill - Pune", "location": {"lat": 18.4621, "lng": 73.9669}},
    {"name": "PMC Shivajinagar Waste Hub - Pune", "location": {"lat": 18.5226, "lng": 73.8488}},
    {"name": "Nashik Waste Management Plant", "location": {"lat": 19.9929, "lng": 73.7853}},
    {"name": "Pathardi Compost Depot - Nashik", "location": {"lat": 19.9570, "lng": 73.7900}},
    {"name": "Sinnar Waste Processing Site", "location": {"lat": 20.0540, "lng": 73.9460}}
]


# ================= DISTANCE FUNCTION =================

def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


@app.route('/')
def home():
    return jsonify({"message": "Smart Waste API running"})


# ================= BINS =================

@app.route('/api/bins', methods=['POST'])
def create_bin():
    data = request.json

    required_fields = ['location', 'capacity', 'address']
    for field in required_fields:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    bin_id = firebase_service.assign_available_bin(data)

    return jsonify({
        "success": True,
        "binID": bin_id
    })


@app.route('/api/bins/<bin_id>', methods=['DELETE'])
def delete_bin(bin_id):
    try:
        firebase_service.realtime_db.child("bins").child(bin_id).delete()
        firebase_service.firestore_db.collection("bins").document(bin_id).delete()

        mapping_ref = firebase_service.realtime_db.child("hardware_mapping")
        mapping = mapping_ref.get() or {}

        for slot, value in mapping.items():
            if value == bin_id:
                mapping_ref.child(slot).delete()

        return jsonify({"success": True})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# ================= SENSOR DATA =================

@app.route('/api/sensor-data', methods=['POST'])
def receive_sensor_data():
    data = request.json

    if 'binID' not in data or 'fillLevel' not in data:
        return jsonify({"success": False}), 400

    bin_id = data['binID']
    fill_level = data['fillLevel']

    current_bin = firebase_service.get_bin_by_id(bin_id)
    if not current_bin:
        return jsonify({"success": False, "error": "Bin not found"}), 404

    previous_status = current_bin.get("status", "normal")

    firebase_service.update_bin_status(bin_id, fill_level)

    updated_bin = firebase_service.get_bin_by_id(bin_id)
    new_status = updated_bin.get("status")

    if previous_status != "critical" and new_status == "critical":
        send_sms_alert(updated_bin)

    return jsonify({"success": True})


# ================= NORMAL ROUTE =================

@app.route('/api/optimize-route', methods=['GET'])
def optimize_route():
    try:
        start_lat = request.args.get("startLat", type=float)
        start_lng = request.args.get("startLng", type=float)
        start_name = request.args.get("startName", default="Truck Start")

        bins_ref = firebase_service.realtime_db.child("bins")
        bins_data = bins_ref.get() or {}

        bins_list = []

        for bin_id, bin_info in bins_data.items():
            if bin_info.get("currentFillLevel", 0) >= 70:
                bins_list.append({
                    "binID": bin_id,
                    "location": bin_info["location"],
                    "currentFillLevel": bin_info.get("currentFillLevel", 0),
                    "binName": bin_info.get("binName", bin_id)
                })

        if len(bins_list) < 3:
            return jsonify({
                "success": False,
                "message": "Minimum 3 bins required for route optimization"
            })

        if start_lat is None or start_lng is None:
            return jsonify({
                "success": True,
                "requireLocation": True
            })

        depot = {
            "binID": "DEPOT",
            "binName": start_name,
            "location": {"lat": start_lat, "lng": start_lng}
        }

        optimized_route = RouteOptimizer.optimize_route(bins_list)
        full_route = [depot] + optimized_route + [depot]

        return jsonify({
            "success": True,
            "route": full_route
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ================= TRUCK FULL ROUTE =================

@app.route('/api/truck-full-route', methods=['GET'])
def truck_full_route():
    try:
        truck_lat = request.args.get("lat", type=float)
        truck_lng = request.args.get("lng", type=float)
        truck_name = request.args.get("name", default="Truck Location")

        if truck_lat is None or truck_lng is None:
            return jsonify({"success": False, "message": "Truck location required"})

        # 🔥 Find nearest garbage center
        nearest_center = None
        min_distance = 999999

        for center in GARBAGE_CENTERS:
            d = calculate_distance(
                truck_lat, truck_lng,
                center["location"]["lat"],
                center["location"]["lng"]
            )
            if d < min_distance:
                min_distance = d
                nearest_center = center

        # 🔥 Get remaining bins
        bins_ref = firebase_service.realtime_db.child("bins")
        bins_data = bins_ref.get() or {}

        bins_list = []

        for bin_id, bin_info in bins_data.items():
            if bin_info.get("currentFillLevel", 0) >= 70:
                bins_list.append({
                    "binID": bin_id,
                    "location": bin_info["location"],
                    "currentFillLevel": bin_info.get("currentFillLevel", 0),
                    "binName": bin_info.get("binName", bin_id)
                })

        optimized_bins = []
        if bins_list:
            optimized_bins = RouteOptimizer.optimize_route(bins_list)

        final_route = []

        final_route.append({
            "binID": "TRUCK",
            "binName": truck_name,
            "location": {"lat": truck_lat, "lng": truck_lng}
        })

        final_route.append({
            "binID": "DUMP",
            "binName": nearest_center["name"],
            "location": nearest_center["location"]
        })

        final_route.extend(optimized_bins)

        final_route.append({
            "binID": "DUMP",
            "binName": nearest_center["name"],
            "location": nearest_center["location"]
        })

        return jsonify({
            "success": True,
            "route": final_route
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/analytics')
def analytics():
    return app.send_static_file('analytics.html')


@app.route('/dashboard')
def dashboard():
    return app.send_static_file('index.html')


if __name__ == '__main__':

    # Start background SMS monitor safely
    sms_thread = threading.Thread(target=monitor_bins_for_sms)
    sms_thread.daemon = True
    sms_thread.start()

    app.run(host=Config.FLASK_HOST, port=Config.FLASK_PORT, debug=True)