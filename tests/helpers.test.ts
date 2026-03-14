import { describe, it, expect } from 'vitest';
import { stripHtml, truncate, formatList, cleanTicketData } from '../src/helpers';

describe('stripHtml', () => {
  it('should return empty string for falsy input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null as any)).toBe('');
    expect(stripHtml(undefined as any)).toBe('');
  });

  it('should return plain text unchanged', () => {
    expect(stripHtml('Hello World')).toBe('Hello World');
  });

  it('should strip simple HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
    expect(stripHtml('<div>Content</div>')).toBe('Content');
    expect(stripHtml('<span>Text</span>')).toBe('Text');
  });

  it('should convert <br> tags to newlines', () => {
    expect(stripHtml('Line 1<br>Line 2')).toBe('Line 1\nLine 2');
    expect(stripHtml('Line 1<br/>Line 2')).toBe('Line 1\nLine 2');
    expect(stripHtml('Line 1<br />Line 2')).toBe('Line 1\nLine 2');
  });

  it('should convert </p> tags to double newlines', () => {
    expect(stripHtml('<p>Para 1</p><p>Para 2</p>')).toBe('Para 1\n\nPara 2');
  });

  it('should convert </div> tags to newlines', () => {
    expect(stripHtml('<div>Block 1</div><div>Block 2</div>')).toBe('Block 1\nBlock 2');
  });

  it('should replace &nbsp; with space', () => {
    expect(stripHtml('Hello&nbsp;World')).toBe('Hello World');
  });

  it('should handle complex HTML', () => {
    const html = '<div><p>Hello <strong>World</strong></p><br><p>New paragraph</p></div>';
    const result = stripHtml(html);
    expect(result).toContain('Hello');
    expect(result).toContain('World');
    expect(result).toContain('New paragraph');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('should normalize multiple newlines', () => {
    expect(stripHtml('<p></p><p></p><p>Content</p>')).toBe('Content');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(stripHtml('  <p>Hello</p>  ')).toBe('Hello');
  });
});

describe('truncate', () => {
  it('should return empty string for falsy input', () => {
    expect(truncate('', 10)).toBe('');
    expect(truncate(null as any, 10)).toBe('');
    expect(truncate(undefined as any, 10)).toBe('');
  });

  it('should return text unchanged if shorter than maxLength', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('should truncate text longer than maxLength with ellipsis', () => {
    expect(truncate('Hello World', 5)).toBe('Hello...');
    expect(truncate('This is a long text', 10)).toBe('This is a ...');
  });

  it('should handle exact length match', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('should handle maxLength of 0', () => {
    expect(truncate('Hello', 0)).toBe('...');
  });
});

describe('formatList', () => {
  it('should return empty string for undefined', () => {
    expect(formatList(undefined)).toBe('');
  });

  it('should return empty string for non-array', () => {
    expect(formatList(null as any)).toBe('');
    expect(formatList('string' as any)).toBe('');
    expect(formatList(123 as any)).toBe('');
  });

  it('should return empty string for empty array', () => {
    expect(formatList([])).toBe('');
  });

  it('should format single item', () => {
    expect(formatList(['item'])).toBe("'item'");
  });

  it('should format multiple items with comma separation', () => {
    expect(formatList(['a', 'b', 'c'])).toBe("'a', 'b', 'c'");
  });

  it('should handle items with special characters', () => {
    expect(formatList(['hello world', "it's here"])).toBe("'hello world', 'it's here'");
  });
});

describe('cleanTicketData', () => {
  it('should return null/undefined unchanged', () => {
    expect(cleanTicketData(null)).toBe(null);
    expect(cleanTicketData(undefined)).toBe(undefined);
  });

  it('should return primitive types unchanged', () => {
    expect(cleanTicketData('string')).toBe('string');
    expect(cleanTicketData(123)).toBe(123);
    expect(cleanTicketData(true)).toBe(true);
  });

  it('should return data without Ticket property unchanged', () => {
    const data = { SomeOther: 'value' };
    expect(cleanTicketData(data)).toEqual({ SomeOther: 'value' });
  });

  it('should clean HTML from single ticket with single article', () => {
    const data = {
      Ticket: {
        TicketID: 1,
        Article: {
          Body: '<p>Hello <strong>World</strong></p>',
        },
      },
    };
    const result = cleanTicketData(data);
    expect(result.Ticket.Article.Body).toBe('Hello World');
  });

  it('should clean HTML from single ticket with multiple articles', () => {
    const data = {
      Ticket: {
        TicketID: 1,
        Article: [
          { Body: '<p>First</p>' },
          { Body: '<div>Second</div>' },
        ],
      },
    };
    const result = cleanTicketData(data);
    expect(result.Ticket.Article[0].Body).toBe('First');
    expect(result.Ticket.Article[1].Body).toBe('Second');
  });

  it('should clean HTML from multiple tickets', () => {
    const data = {
      Ticket: [
        {
          TicketID: 1,
          Article: [{ Body: '<p>Ticket 1</p>' }],
        },
        {
          TicketID: 2,
          Article: [{ Body: '<div>Ticket 2</div>' }],
        },
      ],
    };
    const result = cleanTicketData(data);
    expect(result.Ticket[0].Article[0].Body).toBe('Ticket 1');
    expect(result.Ticket[1].Article[0].Body).toBe('Ticket 2');
  });

  it('should handle ticket without Article property', () => {
    const data = {
      Ticket: {
        TicketID: 1,
        Title: 'No articles',
      },
    };
    const result = cleanTicketData(data);
    expect(result.Ticket.Title).toBe('No articles');
    expect(result.Ticket.Article).toBeUndefined();
  });

  it('should handle article without Body property', () => {
    const data = {
      Ticket: {
        TicketID: 1,
        Article: [{ Subject: 'Test' }],
      },
    };
    const result = cleanTicketData(data);
    expect(result.Ticket.Article[0].Subject).toBe('Test');
    expect(result.Ticket.Article[0].Body).toBeUndefined();
  });
});
