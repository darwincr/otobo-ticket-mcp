/**
 * Helper functions for OTOBO MCP Server
 * Extracted for testability
 */
/**
 * Strip HTML tags from content, preserving structure for LLM consumption
 */
export function stripHtml(html) {
    if (!html)
        return "";
    // Simple heuristic to preserve structure for LLMs
    let text = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]*>?/gm, "") // Strip remaining tags
        .replace(/&nbsp;/g, " "); // Handle common entity
    return text.replace(/\n\s*\n/g, "\n\n").trim(); // Normalize newlines
}
/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text, maxLength) {
    if (!text)
        return "";
    if (text.length <= maxLength)
        return text;
    return text.substring(0, maxLength) + "...";
}
/**
 * Format a list of strings as quoted comma-separated values
 */
export function formatList(list) {
    if (!list || !Array.isArray(list))
        return "";
    return list.map(item => `'${item}'`).join(", ");
}
/**
 * Clean ticket data by stripping HTML from article bodies
 */
export function cleanTicketData(data) {
    if (!data || typeof data !== 'object')
        return data;
    const processTicket = (ticket) => {
        if (ticket.Article) {
            if (Array.isArray(ticket.Article)) {
                ticket.Article.forEach((article) => {
                    if (article.Body)
                        article.Body = stripHtml(article.Body);
                });
            }
            else if (typeof ticket.Article === 'object') {
                if (ticket.Article.Body)
                    ticket.Article.Body = stripHtml(ticket.Article.Body);
            }
        }
    };
    if (data.Ticket) {
        if (Array.isArray(data.Ticket)) {
            data.Ticket.forEach(processTicket);
        }
        else if (typeof data.Ticket === 'object') {
            processTicket(data.Ticket);
        }
    }
    return data;
}
