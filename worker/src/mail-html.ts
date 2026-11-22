import sanitizeHtml from "sanitize-html";

// Composer HTML comes from the browser, so it is re-sanitized server-side before it reaches
// recipients. Formatting produced by the rich-text editor (bold/italic/underline, lists,
// alignment, font size/colour, links, images) is kept; scripts, handlers, iframes, forms and
// non-http(s) URLs are removed.
const STYLE_COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^[a-z]{3,20}$/i];

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html || "", {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "font", "span", "u", "s", "strike", "hr", "center"]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "width", "height", "title", "style"],
      font: ["color", "size", "face"],
      "*": ["style", "align", "dir"],
      td: ["colspan", "rowspan", "style", "align", "valign", "width"],
      th: ["colspan", "rowspan", "style", "align", "valign", "width"],
      table: ["border", "cellpadding", "cellspacing", "width", "style", "align"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "cid"] },
    allowedStyles: {
      "*": {
        color: STYLE_COLOR,
        "background-color": STYLE_COLOR,
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": [/^\d{1,3}(\.\d+)?(px|pt|em|rem|%)$/, /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/],
        "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [/^[a-z\s-]{1,40}$/],
        "font-family": [/^[\w\s,'"-]{1,100}$/],
        "line-height": [/^[\d.]+(px|em|%)?$/],
        margin: [/^[\d\s.pxem%-]{1,40}$/],
        "margin-left": [/^[\d.]+(px|em)$/],
        "padding-left": [/^[\d.]+(px|em)$/],
        "max-width": [/^\d{1,4}(px|%)$/],
        width: [/^\d{1,4}(px|%)$/],
        height: [/^(auto|\d{1,4}px)$/],
        border: [/^[\w\s#.()-]{1,60}$/],
        "border-left": [/^[\w\s#.()-]{1,60}$/],
      },
    },
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } }),
    },
  });
}

/** Wraps sanitized fragment HTML in a minimal email-safe document. */
export function wrapEmailHtml(fragment: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${fragment}</div>`;
}
