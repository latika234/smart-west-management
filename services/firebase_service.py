import firebase_admin
from firebase_admin import credentials, firestore, db
from datetime import datetime


class FirebaseService:
    def __init__(self, credentials_path, database_url):

        if not firebase_admin._apps:
            cred = credentials.Certificate(credentials_path)
            firebase_admin.initialize_app(cred, {
                'databaseURL': database_url
            })

        self.firestore_db = firestore.client()
        self.realtime_db = db.reference()

        print("Firebase initialized successfully")

    # ================= BINS =================

    def assign_available_bin(self, bin_data):
        try:
            bins_ref = self.realtime_db.child("bins")
            bins = bins_ref.get() or {}

            hardware_count = sum(
                1 for b in bins.values() if b.get("type") == "hardware"
            )

            if hardware_count < 3:
                bin_type = "hardware"
            else:
                bin_type = "virtual"

            new_bin_ref = bins_ref.push()
            bin_id = new_bin_ref.key

            new_bin_ref.set({
                "assigned": True,
                "binName": bin_data["binName"],
                "location": bin_data["location"],
                "address": bin_data["address"],
                "capacity": bin_data["capacity"],
                "currentFillLevel": 0,
                "status": "normal",
                "type": bin_type
            })

            self.firestore_db.collection("bins").document(bin_id).set({
                "binID": bin_id,
                "binName": bin_data.get("binName", f"Bin-{bin_id[-4:]}"),
                "location": bin_data["location"],
                "address": bin_data["address"],
                "capacity": bin_data["capacity"],
                "status": "normal",
                "currentFillLevel": 0,
                "type": bin_type,
                "createdAt": datetime.utcnow()
            })

            # 🔥 Hardware Mapping
            if bin_type == "hardware":
                mapping_ref = self.realtime_db.child("hardware_mapping")
                mapping = mapping_ref.get() or {}

                if "slot1" not in mapping:
                    mapping_ref.update({"slot1": bin_id})
                elif "slot2" not in mapping:
                    mapping_ref.update({"slot2": bin_id})
                elif "slot3" not in mapping:
                    mapping_ref.update({"slot3": bin_id})

            return bin_id

        except Exception as e:
            print("Error assigning bin:", e)
            return None

    def update_bin_status(self, bin_id, fill_level):
        try:
            if fill_level >= 80:
                status = "critical"
            elif fill_level >= 70:
                status = "needs_collection"
            else:
                status = "normal"

            self.realtime_db.child("bins").child(bin_id).update({
                "currentFillLevel": fill_level,
                "status": status,
                "lastUpdated": int(datetime.utcnow().timestamp())
            })

            self.firestore_db.collection("bins").document(bin_id).update({
                "currentFillLevel": fill_level,
                "status": status,
                "lastUpdated": datetime.utcnow()
            })

            return True

        except Exception as e:
            print("Error updating bin:", e)
            return False
        
        
        
    def get_bin_by_id(self, bin_id):
        try:
            bin_data = self.realtime_db.child("bins").child(bin_id).get()
            return bin_data
        except Exception as e:
            print("Error getting bin:", e)
            return None