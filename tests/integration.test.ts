import { describe, it, expect } from 'vitest';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables first
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const OTOBO_URL = process.env.OTOBO_URL;
const OTOBO_USER = process.env.OTOBO_USER;
const OTOBO_PASSWORD = process.env.OTOBO_PASSWORD;
const OTOBO_DEFAULT_QUEUE = process.env.OTOBO_DEFAULT_QUEUE || 'Raw';
const OTOBO_DEFAULT_TYPE = process.env.OTOBO_DEFAULT_TYPE || 'Request';

// Integration tests are opt-in and require explicit credentials
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const hasCredentials = !!OTOBO_URL && !!OTOBO_USER && !!OTOBO_PASSWORD;
const skipIntegration = !runIntegration || !hasCredentials;

// Retry configuration for transient errors
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function callOtoboApi(operation: string, payload: any, retries = MAX_RETRIES): Promise<any> {
  const baseUrl = OTOBO_URL!.replace(/\/$/, '');
  
  try {
    const response = await axios.post(
      `${baseUrl}/${operation}`,
      {
        UserLogin: OTOBO_USER,
        Password: OTOBO_PASSWORD,
        ...payload,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.data && response.data.Error) {
      throw new Error(
        `OTOBO API Error (${operation}): ${response.data.Error.ErrorCode} - ${response.data.Error.ErrorMessage}`
      );
    }
    return response.data;
  } catch (error: any) {
    // Retry on connection reset errors
    if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      await delay(RETRY_DELAY_MS);
      return callOtoboApi(operation, payload, retries - 1);
    }
    throw error;
  }
}

describe.skipIf(skipIntegration)('OTOBO API Integration Tests', () => {
  let testCustomerLogin: string | undefined;
  let createdTicketId: number | undefined;
  let createdTicketNumber: string | undefined;

  // ============================================================================
  // Customer User Tests
  // ============================================================================
  
  describe('CustomerUser Operations', () => {
    it('should search for customer users', async () => {
      const result = await callOtoboApi('CustomerUserSearch', { Search: '*', Limit: 5 });
      
      let users: any[] = [];
      if (result.CustomerUser && Array.isArray(result.CustomerUser)) {
        users = result.CustomerUser;
      } else if (Array.isArray(result)) {
        users = result;
      }

      expect(users.length).toBeGreaterThan(0);
      testCustomerLogin = users[0].UserLogin;
    });

    it('should get customer user details', async () => {
      if (!testCustomerLogin) {
        // Try to get a customer first
        const search = await callOtoboApi('CustomerUserSearch', { Search: '*', Limit: 1 });
        const users = search.CustomerUser || search || [];
        testCustomerLogin = Array.isArray(users) && users.length > 0 ? users[0].UserLogin : undefined;
      }
      
      expect(testCustomerLogin).toBeDefined();
      
      const result = await callOtoboApi('CustomerUserGet', { User: testCustomerLogin });
      expect(result).toBeDefined();
      // API returns user data - structure may vary
      expect(result.UserLogin || result.User?.UserLogin || Object.keys(result).length > 0).toBeTruthy();
    });
  });

  // ============================================================================
  // Discovery/List Operations
  // ============================================================================

  describe('Discovery Operations', () => {
    it('should list queues', async () => {
      const result = await callOtoboApi('QueueList', { Valid: 1 });
      expect(result).toBeDefined();
      // Result is typically { QueueID: { ID: Name, ... } } or similar
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('should list states', async () => {
      const result = await callOtoboApi('StateList', { Valid: 1 });
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('should list priorities', async () => {
      const result = await callOtoboApi('PriorityList', { Valid: 1 });
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('should list types', async () => {
      const result = await callOtoboApi('TypeList', { Valid: 1 });
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });

    it('should list agents/users', async () => {
      const result = await callOtoboApi('UserList', { Valid: 1 });
      expect(result).toBeDefined();
      expect(Object.keys(result).length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Ticket CRUD Operations
  // ============================================================================

  describe('Ticket Operations', () => {
    it('should create a ticket', async () => {
      const payload = {
        Ticket: {
          Title: `Vitest Integration Test ${Date.now()}`,
          Queue: OTOBO_DEFAULT_QUEUE,
          Type: OTOBO_DEFAULT_TYPE,
          State: 'new',
          Priority: '3 normal',
          CustomerUser: testCustomerLogin || OTOBO_USER,
        },
        Article: {
          Subject: 'Test Article Subject',
          Body: 'This is a test ticket created by Vitest integration tests.',
          ContentType: 'text/plain; charset=utf8',
        },
      };

      const result = await callOtoboApi('TicketCreate', payload);
      
      expect(result.TicketID).toBeDefined();
      expect(result.TicketNumber).toBeDefined();
      
      createdTicketId = result.TicketID;
      createdTicketNumber = result.TicketNumber;
    });

    it('should search for ticket by number', async () => {
      expect(createdTicketNumber).toBeDefined();
      
      const result = await callOtoboApi('TicketSearch', { TicketNumber: createdTicketNumber });
      const ids = result.TicketID
        ? Array.isArray(result.TicketID)
          ? result.TicketID
          : [result.TicketID]
        : [];

      expect(ids).toContain(createdTicketId?.toString() || createdTicketId);
    });

    it('should get ticket details by ID', async () => {
      expect(createdTicketId).toBeDefined();
      
      const result = await callOtoboApi('TicketGet', {
        TicketID: createdTicketId,
        AllArticles: 1,
        DynamicFields: 1,
      });

      const ticket = Array.isArray(result.Ticket) ? result.Ticket[0] : result.Ticket;
      expect(ticket).toBeDefined();
      // Use == for loose comparison since API may return string or number
      expect(String(ticket.TicketID)).toBe(String(createdTicketId));
      expect(ticket.Article).toBeDefined();
    });

    it('should update ticket', async () => {
      expect(createdTicketId).toBeDefined();
      
      const updatePayload = {
        TicketID: createdTicketId,
        Ticket: {
          Title: `Updated Vitest Test ${Date.now()}`,
          State: 'open',
        },
        Article: {
          Subject: 'Update Article',
          Body: 'Ticket updated by Vitest integration test.',
          ContentType: 'text/plain; charset=utf8',
        },
      };

      const result = await callOtoboApi('TicketUpdate', updatePayload);
      expect(result.TicketID).toBe(createdTicketId);
    });

    it('should get ticket history', async () => {
      expect(createdTicketId).toBeDefined();
      
      const result = await callOtoboApi('TicketHistoryGet', { TicketID: createdTicketId });
      
      // History structure varies, but should return something
      expect(result).toBeDefined();
      if (result.TicketHistory) {
        expect(Array.isArray(result.TicketHistory)).toBe(true);
      }
    });

    it('should search for open/new tickets', async () => {
      const result = await callOtoboApi('TicketSearch', {
        States: ['open', 'new'],
        Limit: 10,
      });

      const ids = result.TicketID
        ? Array.isArray(result.TicketID)
          ? result.TicketID
          : [result.TicketID]
        : [];

      // Should find at least our created ticket
      expect(ids.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // TicketOverview Simulation
  // ============================================================================

  describe('TicketOverview Simulation', () => {
    it('should fetch and format ticket overview data', async () => {
      // Search for open tickets
      const searchResult = await callOtoboApi('TicketSearch', {
        States: ['open', 'new'],
        Limit: 3,
      });

      const ticketIds = Array.isArray(searchResult.TicketID)
        ? searchResult.TicketID
        : searchResult.TicketID
        ? [searchResult.TicketID]
        : [];

      if (ticketIds.length > 0) {
        const ticketData = await callOtoboApi('TicketGet', {
          TicketID: ticketIds.slice(0, 3),
          AllArticles: 1,
          DynamicFields: 0,
        });

        expect(ticketData.Ticket).toBeDefined();
        
        const tickets = Array.isArray(ticketData.Ticket)
          ? ticketData.Ticket
          : [ticketData.Ticket];
        
        tickets.forEach((t: any) => {
          expect(t.TicketID).toBeDefined();
          expect(t.Title).toBeDefined();
          expect(t.State).toBeDefined();
        });
      }
    });
  });

  // ============================================================================
  // Cleanup - Close the test ticket
  // ============================================================================

  describe('Cleanup', () => {
    it('should close the test ticket', async () => {
      if (createdTicketId) {
        const result = await callOtoboApi('TicketUpdate', {
          TicketID: createdTicketId,
          Ticket: {
            State: 'closed successful',
          },
          Article: {
            Subject: 'Closing test ticket',
            Body: 'Test completed - closing ticket.',
            ContentType: 'text/plain; charset=utf8',
          },
        });
        expect(result.TicketID).toBe(createdTicketId);
      }
    });
  });
});

// Provide skip reason when env vars are missing
if (skipIntegration) {
  describe('OTOBO API Integration Tests', () => {
    it.skip('Skipped: Set RUN_INTEGRATION_TESTS=true and provide OTOBO_URL/OTOBO_USER/OTOBO_PASSWORD', () => {});
  });
}
