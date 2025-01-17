from flask import Flask, request, jsonify
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from web3 import Web3
from config import settings
from utils import load_contract

# Initialize Flask app
app = Flask(__name__)
app.secret_key = "supersecretkey"  # Use a secure secret key in production

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)

# Initialize Web3
web3 = Web3(Web3.HTTPProvider(settings["BLOCKCHAIN_PROVIDER"]))
if not web3.is_connected():
    raise Exception("Failed to connect to Ethereum node")

# Load the voting contract
voting_contract = load_contract(web3, settings)

# Admin class for Flask-Login
class Admin(UserMixin):
    id = 1

# User loader for Flask-Login
@login_manager.user_loader
def load_user(user_id):
    if user_id == "1":
        return Admin()
    return None

# Default route
@app.route("/")
def home():
    return render_template("index.html")
# Admin login route
@app.route("/login", methods=["POST"])
def admin_login():
    data = request.json
    if not data or "username" not in data or "password" not in data:
        return jsonify({"error": "Username and password are required."}), 400

    if data["username"] == settings["ADMIN_USERNAME"] and data["password"] == settings["ADMIN_PASSWORD"]:
        admin = Admin()
        login_user(admin)
        return jsonify({"message": "Logged in as admin."}), 200
    return jsonify({"error": "Invalid credentials."}), 401

# Admin logout route
@app.route("/logout", methods=["POST"])
@login_required
def admin_logout():
    logout_user()
    return jsonify({"message": "Logged out successfully."}), 200

# Register voter route
@app.route("/register", methods=["POST"])
@login_required
def register_voter():
    data = request.json
    if not data or "voter" not in data:
        return jsonify({"error": "Voter address is required."}), 400

    try:
        tx_hash = voting_contract.functions.registerVoter(data["voter"]).transact({"from": settings["ADMIN_ADDRESS"]})
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
        return jsonify({"message": "Voter registered successfully.", "transaction_hash": tx_hash.hex()}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Cast vote route
@app.route("/vote", methods=["POST"])
def cast_vote():
    data = request.json
    if not data or "voter" not in data or "option" not in data:
        return jsonify({"error": "Voter address and option are required."}), 400

    try:
        tx_hash = voting_contract.functions.castVote(data["option"]).transact({"from": data["voter"]})
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
        return jsonify({"message": "Vote cast successfully.", "transaction_hash": tx_hash.hex()}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Get results route
@app.route("/results", methods=["GET"])
def get_results():
    try:
        results = voting_contract.functions.getResults().call()
        return jsonify({"results": results}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Run the Flask app
if __name__ == "__main__":
    app.run(debug=True)