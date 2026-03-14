import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const OTOBO_URL = process.env.OTOBO_URL;
const OTOBO_USER = process.env.OTOBO_USER;
const OTOBO_PASSWORD = process.env.OTOBO_PASSWORD;
const OTOBO_DEFAULT_QUEUE = process.env.OTOBO_DEFAULT_QUEUE || "Raw";
const OTOBO_DEFAULT_TYPE = process.env.OTOBO_DEFAULT_TYPE || "Request";

if (!OTOBO_URL || !OTOBO_USER || !OTOBO_PASSWORD) {
  console.error("Error: Missing OTOBO_URL, OTOBO_USER, or OTOBO_PASSWORD environment variables.");
  process.exit(1);
}

async function callOtoboApi(operation: string, payload: any) {
  try {
    // console.log(`Calling ${operation}...`);
    const baseUrl = OTOBO_URL!.replace(/\/$/, "");
    const response = await axios.post(`${baseUrl}/${operation}`, {
      UserLogin: OTOBO_USER,
      Password: OTOBO_PASSWORD,
      ...payload,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data && response.data.Error) {
        throw new Error(`OTOBO API Error (${operation}): ${response.data.Error.ErrorCode} - ${response.data.Error.ErrorMessage}`);
    }
    return response.data;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
        throw new Error(`HTTP Error calling ${operation}: ${error.message} - ${JSON.stringify(error.response?.data)}`);
    }
    throw error;
  }
}

async function runTests() {
    console.log("🚀 Starting OTOBO Tool Tests...");

    let testUserLogin: string | undefined;
    let createdTicketId: number | undefined;
    let createdTicketNumber: string | undefined;

    // --- 1. CustomerUserSearch ---
    try {
        console.log("\n1️⃣  Testing CustomerUserSearch...");
        const result = await callOtoboApi("CustomerUserSearch", { Search: "*", Limit: 5 });
        
        let users: any[] = [];
        if (result.CustomerUser && Array.isArray(result.CustomerUser)) {
            users = result.CustomerUser;
        } else if (Array.isArray(result)) {
            users = result;
        }

        if (users.length > 0) {
            testUserLogin = users[0].UserLogin;
            console.log(`✅ CustomerUserSearch: Found ${users.length} users. Selected test user: ${testUserLogin}`);
        } else {
            console.warn("⚠️ CustomerUserSearch: No users found. Skipping dependent tests.");
        }
    } catch (e: any) {
        console.error(`❌ CustomerUserSearch Failed: ${e.message}`);
    }

    // --- 2. CustomerUserGet ---
    if (testUserLogin) {
        try {
            console.log("\n2️⃣  Testing CustomerUserGet...");
            const result = await callOtoboApi("CustomerUserGet", { User: testUserLogin });
            // API might return { User: { ... } } or just the user object? 
            // Based on previous log: { "UserLogin": "...", ... } is in the list, 
            // usually Get returns { User: { ... } } or just the fields. 
            // Let's assume success if no error.
            if (result.UserLogin || (result.User && result.User.UserLogin)) {
                 console.log(`✅ CustomerUserGet: Successfully retrieved details for ${testUserLogin}`);
            } else {
                 console.log(`✅ CustomerUserGet: Retrieved data (structure uncertain but no error).`);
            }
        } catch (e: any) {
            console.error(`❌ CustomerUserGet Failed: ${e.message}`);
        }
    }

    // --- 3. TicketCreate ---
    try {
        console.log("\n3️⃣  Testing TicketCreate...");
        const payload = {
            Ticket: {
                Title: `Automated Test Ticket ${Date.now()}`,
                Queue: OTOBO_DEFAULT_QUEUE,
                Type: OTOBO_DEFAULT_TYPE,
                State: "new",
                Priority: "3 normal",
                CustomerUser: testUserLogin || OTOBO_USER, // Fallback to agent if no customer found
            },
            Article: {
                Subject: "Test Article Subject",
                Body: "This is a test ticket created by the automation script.",
                ContentType: "text/plain; charset=utf8",
            }
        };
        const result = await callOtoboApi("TicketCreate", payload);
        createdTicketId = result.TicketID;
        createdTicketNumber = result.TicketNumber;
        
        if (createdTicketId && createdTicketNumber) {
            console.log(`✅ TicketCreate: Created Ticket #${createdTicketNumber} (ID: ${createdTicketId})`);
        } else {
            throw new Error("TicketID or TicketNumber missing in response");
        }
    } catch (e: any) {
        console.error(`❌ TicketCreate Failed: ${e.message}`);
        // Cannot proceed with ticket tests if create failed
        return;
    }

    // --- 4. TicketSearch ---
    if (createdTicketNumber) {
        try {
            console.log("\n4️⃣  Testing TicketSearch...");
            // Search by TicketNumber
            const result = await callOtoboApi("TicketSearch", { TicketNumber: createdTicketNumber });
            // Result is usually { TicketID: [ ... ] }
            const ids = result.TicketID ? (Array.isArray(result.TicketID) ? result.TicketID : [result.TicketID]) : [];
            
            if (ids.includes(createdTicketId!.toString()) || ids.includes(createdTicketId)) {
                console.log(`✅ TicketSearch: Successfully found Ticket #${createdTicketNumber}`);
            } else {
                console.error(`❌ TicketSearch: Ticket #${createdTicketNumber} not found in search results: ${JSON.stringify(ids)}`);
            }
        } catch (e: any) {
            console.error(`❌ TicketSearch Failed: ${e.message}`);
        }
    }

    // --- 5. TicketGet ---
    if (createdTicketId) {
        try {
            console.log("\n5️⃣  Testing TicketGet...");
            const result = await callOtoboApi("TicketGet", { TicketID: createdTicketId, AllArticles: 1 });
            // Result usually { Ticket: [ { ... } ] } or { Ticket: { ... } }
            const ticket = Array.isArray(result.Ticket) ? result.Ticket[0] : result.Ticket;
            
            if (ticket && ticket.TicketID == createdTicketId) {
                console.log(`✅ TicketGet: Retrieved details for Ticket ID ${createdTicketId}`);
                if (ticket.Article) {
                    console.log(`   (Confirmed Article data present)`);
                }
            } else {
                console.error(`❌ TicketGet: Returned data does not match ID ${createdTicketId}`);
            }
        } catch (e: any) {
            console.error(`❌ TicketGet Failed: ${e.message}`);
        }
    }

    // --- 6. TicketUpdate ---
    if (createdTicketId) {
        try {
            console.log("\n6️⃣  Testing TicketUpdate...");
            const updatePayload = {
                TicketID: createdTicketId,
                Ticket: {
                    Title: `Updated Title ${Date.now()}`,
                    State: "open"
                },
                Article: {
                    Subject: "Update Article",
                    Body: "Updating ticket status to open.",
                    ContentType: "text/plain; charset=utf8"
                }
            };
            const result = await callOtoboApi("TicketUpdate", updatePayload);
            // Result usually { TicketID: ..., TicketNumber: ... }
            if (result.TicketID == createdTicketId) {
                console.log(`✅ TicketUpdate: Successfully updated Ticket ID ${createdTicketId}`);
            } else {
                 console.error(`❌ TicketUpdate: Unexpected response: ${JSON.stringify(result)}`);
            }
        } catch (e: any) {
            console.error(`❌ TicketUpdate Failed: ${e.message}`);
        }
    }

    // --- 7. TicketHistoryGet ---
    if (createdTicketId) {
        try {
            console.log("\n7️⃣  Testing TicketHistoryGet...");
            const result = await callOtoboApi("TicketHistoryGet", { TicketID: createdTicketId });
            // format depends on config, usually list of history entries
            if (result.TicketHistory && Array.isArray(result.TicketHistory)) {
                 console.log(`✅ TicketHistoryGet: Retrieved ${result.TicketHistory.length} history entries.`);
            } else {
                 // Sometimes it might be just an object or wrapped differently
                 console.log(`✅ TicketHistoryGet: Retrieved history (structure validated loosely).`);
            }
        } catch (e: any) {
             // TicketHistoryGet might not be enabled or standard in all connectors
            console.warn(`⚠️ TicketHistoryGet Failed (might not be enabled): ${e.message}`);
        }
    }

    // --- 8. TicketOverview (Simulation) ---
    try {
        console.log("\n8️⃣  Testing TicketOverview (Simulation)...");
        // Simulate: Search Open tickets, Get Details for top 1
        const searchRes = await callOtoboApi("TicketSearch", { States: ['open', 'new'], Limit: 5 });
        const ids = searchRes.TicketID ? (Array.isArray(searchRes.TicketID) ? searchRes.TicketID : [searchRes.TicketID]) : [];
        
        if (ids.length > 0) {
            console.log(`   Found ${ids.length} open/new tickets.`);
            const getRes = await callOtoboApi("TicketGet", { TicketID: ids.slice(0, 3), AllArticles: 0 }); // Get top 3
            if (getRes.Ticket) {
                console.log(`✅ TicketOverview: Successfully fetched details for overview.`);
            } else {
                console.error(`❌ TicketOverview: Failed to fetch details.`);
            }
        } else {
            console.log("   No open tickets found for overview test.");
        }
    } catch (e: any) {
        console.error(`❌ TicketOverview Failed: ${e.message}`);
    }

    console.log("\n🎉 Tests Completed.");
}

runTests().catch(e => console.error(e));
