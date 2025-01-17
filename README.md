# Secure & Transparent Voting System

This project implements a **secure and transparent voting system** built using **blockchain technology** to ensure the integrity, privacy, and transparency of votes. It leverages **smart contracts**, a **Flask backend**, and a **web-based frontend**, while integrating **MetaMask** for wallet management and transaction signing. The system ensures the prevention of **cheating**, **multi-voting**, and **fake voting**, with simple and accessible features designed for both admins and voters.

## Features

- **Admin Controls**:
  - Only admins can start a voting session.
  - Admins can customize voting options and the number of polls.
  - Admin can set the duration of the voting session.
  
- **Voter Features**:
  - Voters must connect their MetaMask wallet to participate.
  - Voters can vote only once, ensuring no cheating or multi-voting.
  - After casting a vote, voters will receive a confirmation message.

- **Results Display**:
  - After the voting session ends, results are shown to all users.
  - Results are displayed in a donut chart with percentage breakdowns.
  - In-depth analysis of the voting session is presented.

- **Security & Transparency**:
  - Blockchain ensures secure and immutable voting.
  - Each vote is verified and recorded on the blockchain.
  - Prevents fake votes and guarantees the authenticity of votes.

## Tech Stack

- **Backend**: Flask (Python)
- **Blockchain**: Smart Contracts (Solidity), Ethereum Blockchain
- **Frontend**: HTML, CSS, JavaScript
- **MetaMask**: Wallet integration for secure transaction signing
- **Data Visualization**: Donut chart for displaying voting results

## Installation

### Prerequisites

- Python 3.x
- Flask
- MetaMask browser extension
- Node.js and npm (for smart contract deployment)
- Ganache or any local Ethereum test network for smart contract testing

### Step-by-Step Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/4LPH7/Secure-Blockchain-Voting-System.git
   cd Secure-Blockchain-Voting-System
   ```

2. **Install Backend Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set Up the Frontend**:
   Navigate to the frontend directory and install any necessary dependencies:
   ```bash
   cd frontend
   npm install
   ```

4. **Configure MetaMask**:
   - Set up MetaMask with your Ethereum wallet.
   - Connect MetaMask to a test network (e.g., Rinkeby or Ganache).

5. **Deploy Smart Contract**:
   - Compile and deploy the smart contract to the Ethereum blockchain using tools like **Truffle** or **Hardhat**.

6. **Run the Application**:
   - Start the Flask backend:
     ```bash
     python app.py
     ```
   - Open the web application in your browser (`http://localhost:5000`).

## Usage

- **Admin Login**: The admin can log in to the system and start the voting session. They can customize the voting options and duration.
- **Voter Login**: Voters connect their MetaMask wallet to vote. They can only vote once per session.
- **Results**: After the session ends, the admin can view the results in the form of a donut chart and detailed analysis.

## Contributing

Contributions are welcome! If you have suggestions or improvements, feel free to create a pull request or open an issue.

1. Fork the repository
2. Create a new branch for your changes
3. Commit your changes
4. Push to your forked repository
5. Open a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- **Ethereum**: For enabling secure and transparent voting through blockchain technology.
- **MetaMask**: For wallet management and transaction signing.
- **Flask**: For building the backend API.
- **Chart.js**: For the donut chart visualization.

---
## Author

- GitHub: [@4LPH7](https://github.com/4LPH7)

Feel free to contribute or suggest improvements!

---
### Show your support

Give a ⭐ if you like this website!

<a href="https://buymeacoffee.com/arulartadg" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-violet.png" alt="Buy Me A Coffee" height= "60px" width= "217px" ></a>
