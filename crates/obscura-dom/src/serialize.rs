use crate::tree::{DomTree, NodeData, NodeId};

impl DomTree {
    pub fn outer_html(&self, node_id: NodeId) -> String {
        let mut buf = String::new();
        self.serialize_node(node_id, true, false, &mut buf);
        buf
    }

    pub fn inner_html(&self, node_id: NodeId) -> String {
        let mut buf = String::new();
        self.serialize_children(node_id, false, &mut buf);
        buf
    }

    /// Like [`outer_html`](Self::outer_html), but stamps every element with a
    /// `data-obscura-nid="<NodeId>"` attribute. A downstream renderer (Blitz)
    /// can then map a painted/laid-out node back to the originating Obscura
    /// [`NodeId`] for geometry queries (`getBoundingClientRect`, box model, …).
    pub fn outer_html_with_obscura_ids(&self, node_id: NodeId) -> String {
        let mut buf = String::new();
        self.serialize_node(node_id, true, true, &mut buf);
        buf
    }

    fn serialize_node(
        &self,
        node_id: NodeId,
        include_self: bool,
        emit_nids: bool,
        buf: &mut String,
    ) {
        let node = match self.get_node(node_id) {
            Some(n) => n,
            None => return,
        };

        match &node.data {
            NodeData::Document => {
                self.serialize_children(node_id, emit_nids, buf);
            }
            NodeData::Doctype { name, .. } => {
                buf.push_str("<!DOCTYPE ");
                buf.push_str(name);
                buf.push('>');
            }
            NodeData::Element { name, attrs, template_contents, .. } => {
                let tag = name.local.as_ref();
                if include_self {
                    buf.push('<');
                    buf.push_str(tag);
                    for attr in attrs {
                        buf.push(' ');
                        let attr_name = attr.name.local.as_ref();
                        buf.push_str(attr_name);
                        buf.push_str("=\"");
                        escape_attr(&attr.value, buf);
                        buf.push('"');
                    }
                    if emit_nids {
                        buf.push_str(" data-obscura-nid=\"");
                        buf.push_str(&node_id.raw().to_string());
                        buf.push('"');
                    }
                    buf.push('>');
                }

                if !is_void_element(tag) {
                    // HTML fragment-serialization: a <template>'s serialized body is
                    // its template-contents children (a template has no direct
                    // children — they all live in the separate content subtree).
                    match template_contents {
                        Some(tc) => self.serialize_children(*tc, emit_nids, buf),
                        None => self.serialize_children(node_id, emit_nids, buf),
                    }
                    if include_self {
                        buf.push_str("</");
                        buf.push_str(tag);
                        buf.push('>');
                    }
                }
            }
            NodeData::Text { contents } => {
                let parent_is_raw = node
                    .parent
                    .and_then(|pid| {
                        self.with_node(pid, |p| {
                            p.as_element()
                                .map(|name| is_raw_text_element(name.local.as_ref()))
                                .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);

                if parent_is_raw {
                    buf.push_str(contents);
                } else {
                    escape_text(contents, buf);
                }
            }
            NodeData::Comment { contents } => {
                buf.push_str("<!--");
                buf.push_str(contents);
                buf.push_str("-->");
            }
            NodeData::ProcessingInstruction { target, data } => {
                buf.push_str("<?");
                buf.push_str(target);
                buf.push(' ');
                buf.push_str(data);
                buf.push('>');
            }
        }
    }

    fn serialize_children(&self, node_id: NodeId, emit_nids: bool, buf: &mut String) {
        for child_id in self.children(node_id) {
            self.serialize_node(child_id, true, emit_nids, buf);
        }
    }
}

fn escape_text(s: &str, buf: &mut String) {
    for c in s.chars() {
        match c {
            '&' => buf.push_str("&amp;"),
            '<' => buf.push_str("&lt;"),
            '>' => buf.push_str("&gt;"),
            _ => buf.push(c),
        }
    }
}

fn escape_attr(s: &str, buf: &mut String) {
    for c in s.chars() {
        match c {
            '&' => buf.push_str("&amp;"),
            '"' => buf.push_str("&quot;"),
            _ => buf.push(c),
        }
    }
}

fn is_void_element(tag: &str) -> bool {
    matches!(
        tag,
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn is_raw_text_element(tag: &str) -> bool {
    matches!(tag, "script" | "style" | "textarea" | "title")
}

#[cfg(test)]
mod tests {
    use crate::tree_sink::parse_html;

    #[test]
    fn test_outer_html() {
        let tree = parse_html(r#"<div id="test"><p>Hello</p></div>"#);
        let div = tree.get_element_by_id("test").unwrap();
        let html = tree.outer_html(div);
        assert!(html.contains(r#"<div id="test">"#));
        assert!(html.contains("<p>Hello</p>"));
        assert!(html.contains("</div>"));
    }

    #[test]
    fn test_inner_html() {
        let tree = parse_html(r#"<div id="test"><p>Hello</p><p>World</p></div>"#);
        let div = tree.get_element_by_id("test").unwrap();
        let html = tree.inner_html(div);
        assert!(html.contains("<p>Hello</p>"));
        assert!(html.contains("<p>World</p>"));
        assert!(!html.contains("<div"));
    }

    #[test]
    fn test_serialize_attributes() {
        let tree = parse_html(r#"<a href="https://example.com" class="link">Click</a>"#);
        let a = tree.query_selector("a").unwrap().unwrap();
        let html = tree.outer_html(a);
        assert!(html.contains("href=\"https://example.com\""));
        assert!(html.contains("class=\"link\""));
    }

    #[test]
    fn test_serialize_special_chars() {
        let tree = parse_html("<p>Hello &amp; World &lt;3</p>");
        let p = tree.query_selector("p").unwrap().unwrap();
        let html = tree.outer_html(p);
        assert!(html.contains("&amp;"));
        assert!(html.contains("&lt;"));
    }

    #[test]
    fn test_void_elements() {
        let tree = parse_html(r#"<img src="test.png"><br>"#);
        let img = tree.query_selector("img").unwrap().unwrap();
        let html = tree.outer_html(img);
        assert!(html.contains("<img"));
        assert!(!html.contains("</img>"));
    }
}
