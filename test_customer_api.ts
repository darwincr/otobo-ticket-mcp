import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const OTOBO_URL = process.env.OTOBO_URL;
const OTOBO_USER = process.env.OTOBO_USER;
const OTOBO_PASSWORD = process.env.OTOBO_PASSWORD;

if (!OTOBO_URL || !OTOBO_USER || !OTOBO_PASSWORD) {
  console.error("Error: Missing OTOBO_URL, OTOBO_USER, or OTOBO_PASSWORD environment variables.");
  process.exit(1);
}

async function callOtoboApi(operation: string, payload: any) {
  try {
    console.log(`Calling ${operation} with payload:`, JSON.stringify(payload, null, 2));
    const baseUrl = OTOBO_URL!.replace(/\/$/, "");
    const response = await axios.post(`${baseUrl}/${operation}`, {
      UserLogin: OTOBO_USER,
      Password: OTOBO_PASSWORD,
      ...payload,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
        console.error(`OTOBO API Error (${operation}): ${error.message} - ${JSON.stringify(error.response?.data)}`);
    } else {
        console.error(`OTOBO API Error (${operation}): ${error.message}`);
    }
    return null;
  }
}

async function test() {
    console.log("Testing CustomerUserSearch...");
    // Search for any user containing 'a' or just wildcard if supported. 
    // Usually '*' works for all if configured, or just minimal term.
    const searchResult = await callOtoboApi("CustomerUserSearch", { Term: "*", Limit: 5 });
    
    if (searchResult) {
        console.log("CustomerUserSearch Result:", JSON.stringify(searchResult, null, 2));
        
        let users = [];
        // OTOBO CustomerUserSearch typically returns a list of IDs or a map depending on config.
        // If it returns { CustomerUser: [ ... ] } or just [ ... ] or { UserLogin: ... }
        // Let's inspect the output.
        // Common OTOBO return for Search is a list of UserLogins.
        
        // Let's handle generic structure
        if (Array.isArray(searchResult)) {
            users = searchResult;
        } else if (searchResult.ID) { // Single result sometimes
             users = [searchResult.ID];
        } else if (typeof searchResult === 'object') {
             // Maybe keys are logins? or it has a property holding the list
             users = Object.keys(searchResult);
        }

        if (users.length > 0) {
            const userLogin = users[0];
            console.log(`Testing CustomerUserGet for UserLogin: ${userLogin}`);
            const userDetails = await callOtoboApi("CustomerUserGet", { UserLogin: userLogin });
            console.log("CustomerUserGet Result:", JSON.stringify(userDetails, null, 2));
        } else {
            console.log("No users found to test CustomerUserGet.");
        }
    } else {
        console.log("CustomerUserSearch failed.");
    }
}

test();
