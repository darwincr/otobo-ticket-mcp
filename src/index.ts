#!/usr/bin/env node

import fs from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Ensure we load the .env file from the project root (one level up from dist/)
// This fixes issues where CWD might be different or .env isn't found by default
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
const configPath = path.resolve(__dirname, '../otobo_config.json');

if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath, override: false, quiet: true });
  if (result.error) {
    console.error("Error loading .env file from:", envPath, result.error);
  }
} else {
  dotenv.config({ override: false, quiet: true });
}

const OTOBO_URL = process.env.OTOBO_URL;
const OTOBO_USER = process.env.OTOBO_USER;
const OTOBO_PASSWORD = process.env.OTOBO_PASSWORD;
const OTOBO_DEFAULT_QUEUE = process.env.OTOBO_DEFAULT_QUEUE || "Raw";
const OTOBO_DEFAULT_TYPE = process.env.OTOBO_DEFAULT_TYPE || "Request";

if (!OTOBO_URL || !OTOBO_USER || !OTOBO_PASSWORD) {
  console.error("Error: Missing OTOBO_URL, OTOBO_USER, or OTOBO_PASSWORD environment variables.");
  process.exit(1);
}

// Log configuration for debugging (masking password)
console.error(`OTOBO Configuration:`);
console.error(`  URL: ${OTOBO_URL}`);
console.error(`  User: ${OTOBO_USER}`);
console.error(`  Queue: ${OTOBO_DEFAULT_QUEUE}`);

const server = new McpServer({
  name: "otobo-ticket-mcp",
  version: "1.0.0",
});

// Load configuration for valid values
let config: any = {};
if (fs.existsSync(configPath)) {
    try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
    } catch (e) {
        console.error("Failed to parse otobo_config.json:", e);
    }
}

function formatList(list: string[] | undefined) {
    if (!list || !Array.isArray(list)) return "";
    return list.map(item => `'${item}'`).join(", ");
}

const VALID_VALUES_INSTRUCTION = "\nVALID VALUES:\n" +
  (config.queues ? `- Queues: ${formatList(config.queues)}\n` : "") +
  (config.states ? `- States: ${formatList(config.states)}\n` : "") +
  (config.priorities ? `- Priorities: ${formatList(config.priorities)}\n` : "") +
  (config.types ? `- Types: ${formatList(config.types)}\n` : "") +
  (config.owners ? `- Owners: ${formatList(config.owners)}\n` : "") +
  (config.customer_users ? `- Customer Users: ${formatList(config.customer_users)}` : "");

// Retry configuration for transient network errors
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 500;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retryable error codes (transient network issues)
const RETRYABLE_ERRORS = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];

// Helper function to call OTOBO API with retry logic
async function callOtoboApi(operation: string, payload: any, retries = MAX_RETRIES): Promise<any> {
  const baseUrl = OTOBO_URL!.replace(/\/$/, "");
  const fullUrl = `${baseUrl}/${operation}`;
  
  try {
    const response = await axios.post(fullUrl, {
      UserLogin: OTOBO_USER,
      Password: OTOBO_PASSWORD,
      ...payload,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    // Check for OTOBO-specific business errors (which often come as 200 OK)
    if (response.data && response.data.Error) {
        const err = response.data.Error;
        throw new Error(`OTOBO API Error (${operation}): ${err.ErrorCode} - ${err.ErrorMessage}`);
    }

    return response.data;
  } catch (error: any) {
    const errorCode = error.code || (axios.isAxiosError(error) && error.code);
    
    // Retry on transient network errors
    if (retries > 0 && errorCode && RETRYABLE_ERRORS.includes(errorCode)) {
      const retryDelay = INITIAL_RETRY_DELAY_MS * (MAX_RETRIES - retries + 1); // Exponential backoff
      console.error(`[OTOBO] ${operation} failed with ${errorCode}, retrying in ${retryDelay}ms... (${retries} retries left)`);
      await delay(retryDelay);
      return callOtoboApi(operation, payload, retries - 1);
    }
    
    let errorMessage = error.message;
    if (axios.isAxiosError(error)) {
        errorMessage = `${error.message} - ${JSON.stringify(error.response?.data)}`;
    }
    // Add context to the error
    throw new Error(`Failed to call ${operation} (${fullUrl}) as user '${OTOBO_USER}': ${errorMessage}`);
  }
}


// 1. TicketCreate
server.tool(
  "TicketCreate",
  "Create a new ticket in OTOBO. IMPORTANT: Before calling this tool, use ListStates to get valid states, ListPriorities to get valid priorities, and CustomerUserSearch to find/validate the customer user." + VALID_VALUES_INSTRUCTION,
  {
    title: z.string().describe("Title of the ticket"),
    state: z.string().describe("State of the ticket - use ListStates to get valid values"),
    priority: z.string().describe("Priority of the ticket - use ListPriorities to get valid values"),
    customerUser: z.string().describe("Customer User (email or login). REQUIRED. Use CustomerUserSearch to find valid users."),
    articleSubject: z.string().describe("Subject of the initial article"),
    articleBody: z.string().describe("Body of the initial article"),
    articleContentType: z.string().optional().default("text/plain; charset=utf8").describe("Content type of the article"),
    dynamicFields: z.array(z.object({
        Name: z.string(),
        Value: z.union([z.string(), z.array(z.string())]),
    })).optional().describe("List of dynamic fields"),
  },
  async ({ title, state, priority, customerUser, articleSubject, articleBody, articleContentType, dynamicFields }) => {
    const payload = {
      Ticket: {
        Title: title,
        Queue: OTOBO_DEFAULT_QUEUE,
        Type: OTOBO_DEFAULT_TYPE,
        State: state,
        Priority: priority,
        CustomerUser: customerUser,
      },
      Article: {
        Subject: articleSubject,
        Body: articleBody,
        ContentType: articleContentType,
      },
      ...(dynamicFields ? { DynamicField: dynamicFields } : {})
    };

    const data = await callOtoboApi("TicketCreate", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 2. TicketGet
server.tool(
  "TicketGet",
  "Get details of a specific ticket.",
  {
    ticketId: z.number().describe("The internal Ticket ID (from TicketOverview)"),
    dynamicFields: z.boolean().optional().default(true).describe("Include dynamic fields in response"),
    allArticles: z.boolean().optional().default(false).describe("Include all articles"),
  },
  async ({ ticketId, dynamicFields, allArticles }) => {
    const payload: any = {
        DynamicFields: dynamicFields ? 1 : 0,
        AllArticles: allArticles ? 1 : 0,
        TicketID: ticketId,
    };

    const data = await callOtoboApi("TicketGet", payload);
    const cleanedData = cleanTicketData(data);
    return {
      content: [{ type: "text", text: JSON.stringify(cleanedData, null, 2) }],
    };
  }
);

// 3. TicketHistoryGet
server.tool(
  "TicketHistoryGet",
  "Get the history of a ticket.",
  {
    ticketId: z.number().describe("The internal Ticket ID"),
  },
  async ({ ticketId }) => {
    const payload = {
        TicketID: ticketId,
    };
    // Note: TicketHistoryGet might not be a standard generic interface operation by default in some setups,
    // usually TicketGet with options is used, or a specific History operation if configured.
    // Assuming standard 'TicketHistoryGet' operation exists or mapped.
    // If not, we might need to rely on TicketGet or assume the user configured a custom operation.
    // However, TicketGet often returns history if configured? No, TicketGet returns Ticket data.
    // OTOBO has a TicketHistoryGet operation for Generic Interface?
    // Checking docs implicitly: There is a TicketHistoryGet operation in Kernel/GenericInterface/Operation/Ticket/TicketHistoryGet.pm
    const data = await callOtoboApi("TicketHistoryGet", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 4. TicketSearch
server.tool(
  "TicketSearch",
  "Search for tickets based on various criteria. Use ListQueues and ListStates to get valid filter values." + VALID_VALUES_INSTRUCTION,
  {
    ticketNumber: z.string().optional().describe("Exact ticket number to search for"),
    title: z.string().optional().describe("Title search - wildcards supported (*)"),
    queues: z.array(z.string()).optional().describe("Filter by queues - use ListQueues to get valid values"),
    states: z.array(z.string()).optional().describe("Filter by states - use ListStates to get valid values"),
    customerUser: z.string().optional().describe("Filter by customer - use CustomerUserSearch to find valid users"),
    limit: z.number().optional().default(50),
  },
  async ({ ticketNumber, title, queues, states, customerUser, limit }) => {
    const payload: any = {
        Limit: limit,
    };
    if (ticketNumber) payload.TicketNumber = ticketNumber;
    if (title) payload.Title = title;
    if (queues) payload.Queues = queues;
    if (states) payload.States = states;
    if (customerUser) payload.CustomerUserLogin = customerUser;

    const data = await callOtoboApi("TicketSearch", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 5. TicketUpdate
server.tool(
  "TicketUpdate",
  "Update an existing ticket. IMPORTANT: Before calling this tool, use ListQueues, ListStates, ListPriorities to get valid values for the respective fields." + VALID_VALUES_INSTRUCTION,
  {
    ticketId: z.number().describe("The internal Ticket ID - use TicketSearch or TicketGetByNumber to find it"),
    title: z.string().optional().describe("New title for the ticket"),
    queue: z.string().optional().describe("New queue - use ListQueues to get valid values"),
    state: z.string().optional().describe("New state - use ListStates to get valid values"),
    priority: z.string().optional().describe("New priority - use ListPriorities to get valid values"),
    dynamicFields: z.array(z.object({
        Name: z.string(),
        Value: z.union([z.string(), z.array(z.string())]),
    })).optional(),
    article: z.object({
        Subject: z.string(),
        Body: z.string(),
        ContentType: z.string().optional().default("text/plain; charset=utf8"),
    }).optional().describe("Optional article to add during update"),
  },
  async ({ ticketId, title, queue, state, priority, dynamicFields, article }) => {
    const payload: any = {
        TicketID: ticketId,
    };
    
    // Only construct Ticket object if fields are provided
    const ticketData: any = {};
    if (title) ticketData.Title = title;
    if (queue) ticketData.Queue = queue;
    if (state) ticketData.State = state;
    if (priority) ticketData.Priority = priority;
    
    // Add Ticket object to payload only if it has keys
    if (Object.keys(ticketData).length > 0) {
        payload.Ticket = ticketData;
    }

    if (dynamicFields) {
        payload.DynamicField = dynamicFields;
    }

    if (article) {
        payload.Article = {
            Subject: article.Subject,
            Body: article.Body,
            ContentType: article.ContentType || "text/plain; charset=utf8",
        };
    }

    const data = await callOtoboApi("TicketUpdate", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Helper functions for content optimization
function stripHtml(html: string): string {
  if (!html) return "";
  // Simple heuristic to preserve structure for LLMs
  let text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]*>?/gm, "") // Strip remaining tags
      .replace(/&nbsp;/g, " "); // Handle common entity
  
  return text.replace(/\n\s*\n/g, "\n\n").trim(); // Normalize newlines
}

function truncate(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function cleanTicketData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const processTicket = (ticket: any) => {
        if (ticket.Article) {
            if (Array.isArray(ticket.Article)) {
                ticket.Article.forEach((article: any) => {
                    if (article.Body) article.Body = stripHtml(article.Body);
                });
            } else if (typeof ticket.Article === 'object') {
                 if (ticket.Article.Body) ticket.Article.Body = stripHtml(ticket.Article.Body);
            }
        }
    };

    if (data.Ticket) {
        if (Array.isArray(data.Ticket)) {
            data.Ticket.forEach(processTicket);
        } else if (typeof data.Ticket === 'object') {
            processTicket(data.Ticket);
        }
    }
    return data;
}

// 6. TicketOverview
server.tool(
  "TicketOverview",
  "Get a high-level overview of OPEN/active tickets (excludes closed or not required), optimized for LLM consumption. Use this for quick checks or general summaries.",
  {
    queue: z.string().optional().describe("Filter by queue"),
    state: z.string().optional().describe("Filter by state"),
    customerName: z.string().optional().describe("Filter by Customer ID/Name"),
    limit: z.number().optional().default(5).describe("Number of tickets to summarize (max 50)"),
  },
  async ({ queue, state, customerName, limit }) => {
    // 1. Search for tickets
    const searchPayload: any = {
        Limit: Math.min(limit, 50), // Enforce strict limit
    };
    if (queue) searchPayload.Queues = [queue];
    
    if (state) {
        searchPayload.States = [state];
    } else {
        // Default to active states if no specific state is requested
        // Excludes: 'closed successful', 'closed unsuccessful', 'not required'
        searchPayload.States = [
            'awaiting 3rd party', 
            'awaiting customer', 
            'escalated', 
            'open', 
            'pending auto close+', 
            'pending auto close-', 
            'pending reminder', 
            'scheduled'
        ];
    }
    
    if (customerName) searchPayload.CustomerID = customerName;

    let searchResult;
    try {
        searchResult = await callOtoboApi("TicketSearch", searchPayload);
    } catch (e: any) {
        // If the search fails and we had a customerName filter, retry without it
        if (customerName) {
            // console.error(`Search with CustomerID '${customerName}' failed. Retrying without it.`);
            delete searchPayload.CustomerID;
            try {
                searchResult = await callOtoboApi("TicketSearch", searchPayload);
            } catch (retryE: any) {
                return { content: [{ type: "text", text: `Error searching tickets (retried without customer filter): ${retryE.message || retryE}` }] };
            }
        } else {
             return { content: [{ type: "text", text: `Error searching tickets: ${e.message || e}` }] };
        }
    }

    const ticketIds = Array.isArray(searchResult.TicketID) 
      ? searchResult.TicketID 
      : (searchResult.TicketID ? [searchResult.TicketID] : []);

    if (ticketIds.length === 0) {
        return { content: [{ type: "text", text: "No tickets found matching the criteria." }] };
    }

    // 2. Fetch details for these tickets
    let ticketsData;
    try {
        ticketsData = await callOtoboApi("TicketGet", { 
            TicketID: ticketIds,
            DynamicFields: 0, // Disable dynamic fields for summary to save tokens
            AllArticles: 1,   // Fetch articles to get content
        });
    } catch (e) {
         return { content: [{ type: "text", text: `Error fetching ticket details: ${e}` }] };
    }
    
    let tickets = ticketsData.Ticket;
    if (tickets && !Array.isArray(tickets)) {
        tickets = [tickets];
    }

    if (!tickets || tickets.length === 0) {
         return { content: [{ type: "text", text: "No ticket details returned." }] };
    }

    // 3. Process and Summarize
    const summary = tickets.map((t: any) => {
        // Assuming articles are returned in chronological order, take the last one for "most recent"
        const articles = t.Article;
        const latestArticle = (articles && Array.isArray(articles) && articles.length > 0) 
            ? articles[articles.length - 1] 
            : (articles && typeof articles === 'object' ? articles : null); // Handle case where Article is single object

        let content = "No articles";
        
        if (latestArticle && latestArticle.Body) {
            const stripped = stripHtml(latestArticle.Body);
            content = stripped.length > 300 ? stripped.substring(0, 300) + "..." : stripped;
        }

        return {
            TicketID: t.TicketID,
            CaseNumber: t.TicketNumber,
            Sender: t.CustomerUserID || t.From || "Unknown", // "Sender" often maps to CustomerUserID or From field in article
            Title: t.Title,
            State: t.State,
            Queue: t.Queue,
            Owner: t.Owner,
            CustomerID: t.CustomerID,
            Content: content,
        };
    });

    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

// 7. CustomerUserSearch
server.tool(
  "CustomerUserSearch",
  "Search for customer users.",
  {
    term: z.string().describe("Search term (e.g., name, email, login)"),
    limit: z.number().optional().default(50).describe("Max results"),
  },
  async ({ term, limit }) => {
    const payload = {
      Search: term,
      Limit: limit,
    };
    const data = await callOtoboApi("CustomerUserSearch", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 8. CustomerUserGet
server.tool(
  "CustomerUserGet",
  "Get details of a customer user.",
  {
    userLogin: z.string().describe("Customer User Login"),
  },
  async ({ userLogin }) => {
    const payload = {
      User: userLogin,
    };
    const data = await callOtoboApi("CustomerUserGet", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 9. GetTicketMetadata (DEPRECATED - use ListQueues, ListStates, ListPriorities, ListTypes, ListAgents instead)
server.tool(
  "GetTicketMetadata",
  "DEPRECATED: Use ListQueues, ListStates, ListPriorities, ListTypes, ListAgents for live API data. This returns static config file values which may be outdated.",
  {},
  async () => {
    try {
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            return {
                content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
            };
        } else {
             return {
                content: [{ type: "text", text: JSON.stringify({ error: "Configuration file 'otobo_config.json' not found." }) }],
            };
        }
    } catch (e: any) {
        return {
            content: [{ type: "text", text: `Failed to load metadata config: ${e.message}` }],
        };
    }
  }
);

// ============================================================================
// DISCOVERY TOOLS - Use these to get valid parameter values before other tools
// ============================================================================

// 10. ListQueues
server.tool(
  "ListQueues",
  "Get all available queues from OTOBO. Use this to discover valid queue names before creating or updating tickets.",
  {
    valid: z.boolean().optional().default(true).describe("Only return valid/active queues (default: true)"),
  },
  async ({ valid }) => {
    const payload = {
      Valid: valid ? 1 : 0,
    };
    const data = await callOtoboApi("QueueList", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 11. ListStates
server.tool(
  "ListStates",
  "Get all available ticket states from OTOBO. Use this to discover valid state names before creating or updating tickets. States include type info (e.g., 'open', 'closed', 'pending').",
  {
    valid: z.boolean().optional().default(true).describe("Only return valid/active states (default: true)"),
  },
  async ({ valid }) => {
    const payload = {
      Valid: valid ? 1 : 0,
    };
    const data = await callOtoboApi("StateList", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 12. ListPriorities
server.tool(
  "ListPriorities",
  "Get all available ticket priorities from OTOBO. Use this to discover valid priority names before creating or updating tickets.",
  {
    valid: z.boolean().optional().default(true).describe("Only return valid/active priorities (default: true)"),
  },
  async ({ valid }) => {
    const payload = {
      Valid: valid ? 1 : 0,
    };
    const data = await callOtoboApi("PriorityList", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 13. ListTypes
server.tool(
  "ListTypes",
  "Get all available ticket types from OTOBO. Use this to discover valid type names before creating tickets.",
  {
    valid: z.boolean().optional().default(true).describe("Only return valid/active types (default: true)"),
  },
  async ({ valid }) => {
    const payload = {
      Valid: valid ? 1 : 0,
    };
    const data = await callOtoboApi("TypeList", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 14. ListAgents
server.tool(
  "ListAgents",
  "Get all available agents/users from OTOBO. Use this to discover valid owner/responsible names before assigning tickets.",
  {
    valid: z.boolean().optional().default(true).describe("Only return valid/active agents (default: true)"),
  },
  async ({ valid }) => {
    const payload = {
      Valid: valid ? 1 : 0,
    };
    const data = await callOtoboApi("UserList", payload);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// 15. TicketGetByNumber
server.tool(
  "TicketGetByNumber",
  "Get ticket details by ticket NUMBER (e.g., '2025010100001'). This is a convenience tool that first searches for the ticket ID, then retrieves full details. Use this when you have a ticket number instead of internal ID.",
  {
    ticketNumber: z.string().describe("The ticket number (e.g., '2025010100001')"),
    dynamicFields: z.boolean().optional().default(true).describe("Include dynamic fields in response"),
    allArticles: z.boolean().optional().default(false).describe("Include all articles"),
  },
  async ({ ticketNumber, dynamicFields, allArticles }) => {
    // First, search for the ticket to get its ID
    const searchPayload = {
      TicketNumber: ticketNumber,
      Limit: 1,
    };
    
    const searchResult = await callOtoboApi("TicketSearch", searchPayload);
    
    const ticketIds = Array.isArray(searchResult.TicketID) 
      ? searchResult.TicketID 
      : (searchResult.TicketID ? [searchResult.TicketID] : []);

    if (ticketIds.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `No ticket found with number '${ticketNumber}'` }, null, 2) }],
      };
    }

    // Now get the full ticket details
    const getPayload = {
      TicketID: ticketIds[0],
      DynamicFields: dynamicFields ? 1 : 0,
      AllArticles: allArticles ? 1 : 0,
    };

    const data = await callOtoboApi("TicketGet", getPayload);
    const cleanedData = cleanTicketData(data);
    return {
      content: [{ type: "text", text: JSON.stringify(cleanedData, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OTOBO Ticket MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
