use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;

use deno_core::op2;
use deno_core::OpState;
use deno_core::Extension;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use obscura_dom::{DomTree, MutationKind, NodeData, NodeId};
use obscura_net::{CookieJar, ObscuraHttpClient};
use tokio::sync::Mutex;

pub type InterceptCallback = Arc<Mutex<Option<Box<dyn Fn(String, String, String) -> Option<(u16, String, String)> + Send + Sync>>>>;

#[derive(Debug)]
pub enum InterceptResolution {
    Continue {
        url: Option<String>,
        method: Option<String>,
        headers: Option<HashMap<String, String>>,
        body: Option<String>,
    },
    Fulfill {
        status: u16,
        headers: HashMap<String, String>,
        body: String,
    },
    Fail { reason: String },
}

pub struct InterceptedRequest {
    pub request_id: String,
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub resource_type: String,
    pub resolver: tokio::sync::oneshot::Sender<InterceptResolution>,
}

pub struct ObscuraState {
    pub dom: Option<DomTree>,
    pub url: String,
    pub title: String,
    pub blocked_urls: Vec<String>,
    pub cookie_jar: Option<Arc<CookieJar>>,
    pub http_client: Option<Arc<ObscuraHttpClient>>,
    pub pending_navigation: Option<(String, String, String)>,
    pub intercept_tx: Option<tokio::sync::mpsc::UnboundedSender<InterceptedRequest>>,
    pub intercept_counter: u64,
    pub intercept_enabled: bool,
}

impl ObscuraState {
    pub fn new() -> Self {
        ObscuraState {
            dom: None,
            url: "about:blank".to_string(),
            title: String::new(),
            blocked_urls: Vec::new(),
            cookie_jar: None,
            http_client: None,
            pending_navigation: None,
            intercept_tx: None,
            intercept_counter: 0,
            intercept_enabled: false,
        }
    }
}

pub type SharedState = Rc<RefCell<ObscuraState>>;

#[op2]
#[string]
fn op_dom(state: &OpState, #[string] cmd: String, #[string] arg1: String, #[string] arg2: String) -> String {
    let gs = state.borrow::<SharedState>().clone();
    let gs = gs.borrow();
    let dom = match &gs.dom {
        Some(d) => d,
        None => return "null".to_string(),
    };

    match cmd.as_str() {
        "document_node_id" => dom.document().index().to_string(),
        "document_title" => serde_json::to_string(&gs.title).unwrap_or("\"\"".into()),
        "document_url" => serde_json::to_string(&gs.url).unwrap_or("\"\"".into()),
        "document_element" => {
            for cid in dom.children(dom.document()) {
                if let Some(n) = dom.get_node(cid) {
                    if n.as_element().map(|name| name.local.as_ref() == "html").unwrap_or(false) {
                        return cid.index().to_string();
                    }
                }
            }
            "-1".into()
        }
        "document_doctype" => {
            for cid in dom.children(dom.document()) {
                if let Some(n) = dom.get_node(cid) {
                    if let obscura_dom::NodeData::Doctype { name, public_id, system_id } = &n.data {
                        return serde_json::json!({
                            "name": name,
                            "publicId": public_id,
                            "systemId": system_id,
                            "nodeId": cid.index(),
                        }).to_string();
                    }
                }
            }
            "null".into()
        }
        "get_element_by_id" => {
            dom.get_element_by_id(&arg1).map(|id| id.index().to_string()).unwrap_or("-1".into())
        }
        // "ERR" => invalid selector (JS throws SyntaxError); "-1"/"[]" => no match.
        "query_selector" => match dom.query_selector(&arg1) {
            Ok(Some(id)) => id.index().to_string(),
            Ok(None) => "-1".into(),
            Err(_) => "ERR".into(),
        },
        "query_selector_all" => match dom.query_selector_all(&arg1) {
            Ok(ids) => serde_json::to_string(&ids.iter().map(|id| id.index() as i32).collect::<Vec<_>>()).unwrap_or("[]".into()),
            Err(_) => "ERR".into(),
        },
        "query_selector_scoped" => {
            let root_nid = arg1.parse::<u32>().unwrap_or(0);
            match dom.query_selector_from(NodeId::new(root_nid), &arg2) {
                Ok(Some(id)) => id.index().to_string(),
                Ok(None) => "-1".into(),
                Err(_) => "ERR".into(),
            }
        }
        "query_selector_all_scoped" => {
            let root_nid = arg1.parse::<u32>().unwrap_or(0);
            match dom.query_selector_all_from(NodeId::new(root_nid), &arg2) {
                Ok(ids) => serde_json::to_string(&ids.iter().map(|id| id.index() as i32).collect::<Vec<_>>()).unwrap_or("[]".into()),
                Err(_) => "ERR".into(),
            }
        }
        // Element.matches / closest / webkitMatchesSelector. "ERR" => invalid
        // selector (JS throws SyntaxError); "true"/"false" => the match result.
        // arg1 is "<node>" (matches: scope == node) or "<node>,<scope>" (closest:
        // node is the ancestor under test, scope is the fixed context element so
        // `:scope` resolves to it across the whole ancestor walk).
        "element_matches" => {
            let (node_nid, scope_nid) = match arg1.split_once(',') {
                Some((n, s)) => (n.parse::<u32>().unwrap_or(0), s.parse::<u32>().ok()),
                None => {
                    let n = arg1.parse::<u32>().unwrap_or(0);
                    (n, Some(n))
                }
            };
            match dom.element_matches(NodeId::new(node_nid), &arg2, scope_nid.map(NodeId::new)) {
                Ok(true) => "true".into(),
                Ok(false) => "false".into(),
                Err(_) => "ERR".into(),
            }
        }
        // CSS cascade: highest specificity among the rule selector's complex
        // selectors that match this element, or "-1" if none match / non-element /
        // parse error. arg1 = node nid, arg2 = the rule's selector text.
        "selector_match_specificity" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            match dom.selector_match_specificity(NodeId::new(nid), &arg2) {
                Some(spec) => spec.to_string(),
                None => "-1".into(),
            }
        }
        "node_type" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            dom.get_node(NodeId::new(nid)).map(|n| match &n.data {
                NodeData::Document => "9", NodeData::Element { .. } => "1", NodeData::Text { .. } => "3",
                NodeData::Comment { .. } => "8", NodeData::Doctype { .. } => "10", NodeData::ProcessingInstruction { .. } => "7",
            }).unwrap_or("0").into()
        }
        "node_name" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let name: String = dom.get_node(NodeId::new(nid)).map(|n| match &n.data {
                NodeData::Document => "#document".to_string(), NodeData::Element { name, .. } => name.local.as_ref().to_ascii_uppercase(),
                NodeData::Text { .. } => "#text".to_string(), NodeData::Comment { .. } => "#comment".to_string(),
                NodeData::Doctype { name, .. } => name.clone(), NodeData::ProcessingInstruction { target, .. } => target.clone(),
            }).unwrap_or_default();
            serde_json::to_string(&name).unwrap_or("\"\"".into())
        }
        "text_content" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            serde_json::to_string(&dom.text_content(NodeId::new(nid))).unwrap_or("\"\"".into())
        }
        "parent_node" | "first_child" | "last_child" | "next_sibling" | "prev_sibling" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            dom.get_node(NodeId::new(nid)).and_then(|n| match cmd.as_str() {
                "parent_node" => n.parent, "first_child" => n.first_child,
                "last_child" => n.last_child, "next_sibling" => n.next_sibling,
                "prev_sibling" => n.prev_sibling, _ => None,
            }).map(|id| id.index().to_string()).unwrap_or("-1".into())
        }
        "child_nodes" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let ids: Vec<i32> = dom.children(NodeId::new(nid)).iter().map(|id| id.index() as i32).collect();
            serde_json::to_string(&ids).unwrap_or("[]".into())
        }
        "tag_name" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let name = dom.get_node(NodeId::new(nid)).and_then(|n| n.as_element().map(|name| name.local.as_ref().to_ascii_uppercase())).unwrap_or_default();
            serde_json::to_string(&name).unwrap_or("\"\"".into())
        }
        "namespace_uri" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let ns = dom.get_node(NodeId::new(nid)).and_then(|n| n.as_element().map(|name| name.ns.as_ref().to_string()));
            serde_json::to_string(&ns).unwrap_or("null".into())
        }
        "get_attribute" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let val = dom
                .get_node(NodeId::new(nid))
                .and_then(|n| n.get_attribute_qualified(&arg2).map(|s| s.to_string()));
            serde_json::to_string(&val).unwrap_or("null".into())
        }
        // Namespace-aware getter: arg2 = "<ns>\0<local>" ("" ns = null namespace).
        "get_attribute_ns" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let (ns, local) = arg2.split_once('\0').unwrap_or(("", arg2.as_str()));
            let val = dom
                .get_node(NodeId::new(nid))
                .and_then(|n| n.get_attribute_ns(ns, local).map(|s| s.to_string()));
            serde_json::to_string(&val).unwrap_or("null".into())
        }
        "attribute_names" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let names: Vec<String> = dom
                .get_node(NodeId::new(nid))
                .map(|n| {
                    n.attrs()
                        .map(|a| a.iter().map(|x| x.qualified_name()).collect())
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            serde_json::to_string(&names).unwrap_or("[]".into())
        }
        // Space-joined list of an element's `on*` event-handler content-attribute
        // names (e.g. "onclick onload"), or "" if none. Read once at wrapper
        // construction so parsed markup handlers (`<div onclick=…>`) activate as real
        // listeners; the common no-handler element returns "" from a single attr scan.
        "on_handler_attrs" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let names: String = dom
                .get_node(NodeId::new(nid))
                .map(|n| {
                    n.attrs()
                        .map(|attrs| {
                            attrs
                                .iter()
                                .filter_map(|a| {
                                    let l = a.name.local.as_ref();
                                    if l.len() > 2 && l.as_bytes()[0] == b'o' && l.as_bytes()[1] == b'n' {
                                        Some(l.to_string())
                                    } else {
                                        None
                                    }
                                })
                                .collect::<Vec<_>>()
                                .join(" ")
                        })
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            serde_json::to_string(&names).unwrap_or("\"\"".into())
        }
        // Ordered attribute list as [{ns,prefix,local,name,value}] for building
        // the JS Attr/NamedNodeMap wrappers. ns/prefix are null when absent.
        "attribute_list" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let list: Vec<serde_json::Value> = dom
                .get_node(NodeId::new(nid))
                .map(|n| {
                    n.attrs()
                        .map(|attrs| {
                            attrs
                                .iter()
                                .map(|a| {
                                    let ns = a.name.ns.as_ref();
                                    let prefix = a.name.prefix.as_ref().map(|p| p.as_ref());
                                    serde_json::json!({
                                        "ns": if ns.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(ns.to_string()) },
                                        "prefix": prefix,
                                        "local": a.name.local.as_ref(),
                                        "name": a.qualified_name(),
                                        "value": a.value,
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            serde_json::to_string(&list).unwrap_or("[]".into())
        }
        "set_attribute" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let node_id = NodeId::new(nid);
            if let Some((name, value)) = arg2.split_once('\0') {
                let old = dom
                    .get_node(node_id)
                    .and_then(|n| n.get_attribute_qualified(name).map(|s| s.to_string()));
                if name == "id" {
                    dom.with_node_mut(node_id, |n| n.set_attribute_qualified(name, value.to_string()));
                    dom.update_id_index(node_id, old.as_deref(), Some(value));
                } else {
                    dom.with_node_mut(node_id, |n| n.set_attribute_qualified(name, value.to_string()));
                }
                // Phase 0c: attribute mutation record (the op writes via
                // with_node_mut, so it can't ride a child-list tree method).
                // setAttribute always records (creation or change); null namespace.
                dom.record_attribute_mutation(node_id, name, None, old);
            }
            "true".into()
        }
        // Namespace-aware setter: arg2 = "<ns>\0<prefix>\0<local>\0<value>"
        // ("" ns = null namespace, "" prefix = no prefix).
        "set_attribute_ns" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let node_id = NodeId::new(nid);
            let parts: Vec<&str> = arg2.splitn(4, '\0').collect();
            if parts.len() == 4 {
                let (ns, prefix, local, value) = (parts[0], parts[1], parts[2], parts[3]);
                let prefix_opt = if prefix.is_empty() { None } else { Some(prefix) };
                let old = dom
                    .get_node(node_id)
                    .and_then(|n| n.get_attribute_ns(ns, local).map(|s| s.to_string()));
                dom.with_node_mut(node_id, |n| {
                    n.set_attribute_ns(ns, prefix_opt, local, value.to_string())
                });
                // A null-namespace "id" still feeds the id index / named globals.
                if ns.is_empty() && local == "id" {
                    dom.update_id_index(node_id, old.as_deref(), Some(value));
                }
                // setAttributeNS always records; attributeNamespace is the
                // attribute's namespace (null for the empty-string namespace).
                let ns_opt = if ns.is_empty() { None } else { Some(ns.to_string()) };
                dom.record_attribute_mutation(node_id, local, ns_opt, old);
            }
            "true".into()
        }
        // arg2 = "<ns>\0<local>"
        "remove_attribute_ns" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let node_id = NodeId::new(nid);
            let (ns, local) = arg2.split_once('\0').unwrap_or(("", arg2.as_str()));
            let old = dom
                .get_node(node_id)
                .and_then(|n| n.get_attribute_ns(ns, local).map(|s| s.to_string()));
            dom.with_node_mut(node_id, |n| n.remove_attribute_ns(ns, local));
            if ns.is_empty() && local == "id" {
                dom.update_id_index(node_id, old.as_deref(), None);
            }
            // "Remove an attribute" only queues a record when the attribute
            // actually existed (old is Some); removing an absent attribute is a
            // no-op per DOM §"remove an attribute by namespace and local name".
            if old.is_some() {
                let ns_opt = if ns.is_empty() { None } else { Some(ns.to_string()) };
                dom.record_attribute_mutation(node_id, local, ns_opt, old);
            }
            "true".into()
        }
        "inner_html" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            serde_json::to_string(&dom.inner_html(NodeId::new(nid))).unwrap_or("\"\"".into())
        }
        "outer_html" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            serde_json::to_string(&dom.outer_html(NodeId::new(nid))).unwrap_or("\"\"".into())
        }
        "append_child" => {
            let parent = arg1.parse::<u32>().unwrap_or(0);
            let child = arg2.parse::<u32>().unwrap_or(0);
            dom.append_child(NodeId::new(parent), NodeId::new(child));
            "true".into()
        }
        "remove_child" => {
            let child = arg1.parse::<u32>().unwrap_or(0);
            dom.remove_child(NodeId::new(child));
            "true".into()
        }
        "insert_before" => {
            let new_node = arg1.parse::<u32>().unwrap_or(0);
            let ref_node = arg2.parse::<u32>().unwrap_or(0);
            dom.insert_before(NodeId::new(ref_node), NodeId::new(new_node));
            "true".into()
        }
        "remove_attribute" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let node_id = NodeId::new(nid);
            let old = dom
                .get_node(node_id)
                .and_then(|n| n.get_attribute_qualified(&arg2).map(|s| s.to_string()));
            if arg2 == "id" {
                dom.update_id_index(node_id, old.as_deref(), None);
            }
            dom.with_node_mut(node_id, |n| n.remove_attribute_qualified(&arg2));
            // Only record when the attribute existed (no-op removal queues
            // nothing); null namespace for the non-namespaced remove.
            if old.is_some() {
                dom.record_attribute_mutation(node_id, &arg2, None, old);
            }
            "true".into()
        }
        "set_inner_html" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let target = NodeId::new(nid);
            // DOM "replace all with a node": emit ONE childList record (removed =
            // the old children, added = the parsed new children) rather than one
            // per detach/import. Suppress the per-primitive records around the
            // work, then synthesize the single batched record. (Only matters while
            // a MutationObserver is active; otherwise this is a no-op wrapper.)
            let recording = dom.is_recording_mutations();
            let removed = dom.children(target);
            if recording {
                dom.push_suppress_mutations();
            }
            for child in removed.iter() {
                dom.detach(*child);
            }
            if !arg2.is_empty() {
                // Per HTML §fragment parsing, the element itself is the context —
                // markup parses differently under `table`/`tr`/`html` than under a
                // hardcoded `body` (see parse_fragment_ctx). Fall back to `body` for
                // a non-element target (e.g. a bare document root).
                let ctx = dom
                    .get_node(target)
                    .and_then(|n| n.as_element().map(|name| name.local.as_ref().to_string()))
                    .unwrap_or_else(|| "body".to_string());
                let fragment = obscura_dom::parse_fragment_ctx(&arg2, &ctx);
                let import_root = fragment.fragment_root();
                dom.import_children_from(target, &fragment, import_root);
            }
            if recording {
                dom.pop_suppress_mutations();
                let added = dom.children(target);
                if !added.is_empty() || !removed.is_empty() {
                    dom.record_childlist_mutation(target, added, removed, None, None);
                }
            }
            "true".into()
        }
        "set_text_content" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let node_id = NodeId::new(nid);
            let mut old: Option<String> = None;
            let mut is_char_data = false;
            dom.with_node_mut(node_id, |n| {
                match &mut n.data {
                    NodeData::Text { contents } => { old = Some(contents.clone()); *contents = arg2.clone(); is_char_data = true; }
                    NodeData::Comment { contents } => { old = Some(contents.clone()); *contents = arg2.clone(); is_char_data = true; }
                    _ => {}
                }
            });
            if is_char_data {
                dom.record_character_data_mutation(node_id, old);
            }
            "true".into()
        }
        // Phase 0c source switch: JS turns recording on while ≥1 MutationObserver
        // is active, then drains the Rust-authoritative queue each delivery tick.
        "set_mutation_recording" => {
            dom.set_mutation_recording(arg1 == "1");
            "true".into()
        }
        // Atomic childList batching: open/close a suppression scope so a compound
        // JS operation can emit ONE synthesized record instead of one per primitive.
        "push_suppress_mutations" => {
            dom.push_suppress_mutations();
            "true".into()
        }
        "pop_suppress_mutations" => {
            dom.pop_suppress_mutations();
            "true".into()
        }
        // Synthesize one childList record. arg1 = target nid; arg2 =
        // "<added_csv>\0<removed_csv>\0<prev>\0<next>" (csv = comma-separated nids,
        // empty = none; prev/next empty = null sibling).
        "record_childlist" => {
            let target = NodeId::new(arg1.parse::<u32>().unwrap_or(0));
            let parts: Vec<&str> = arg2.split('\0').collect();
            let parse_list = |s: &str| -> Vec<NodeId> {
                s.split(',')
                    .filter(|p| !p.is_empty())
                    .filter_map(|p| p.parse::<u32>().ok())
                    .map(NodeId::new)
                    .collect()
            };
            let parse_opt = |s: Option<&&str>| -> Option<NodeId> {
                s.and_then(|p| p.parse::<u32>().ok()).map(NodeId::new)
            };
            let added = parts.first().map(|s| parse_list(s)).unwrap_or_default();
            let removed = parts.get(1).map(|s| parse_list(s)).unwrap_or_default();
            let prev = parse_opt(parts.get(2));
            let next = parse_opt(parts.get(3));
            dom.record_childlist_mutation(target, added, removed, prev, next);
            "true".into()
        }
        "drain_mutations" => {
            let recs = dom.drain_mutations();
            let arr: Vec<serde_json::Value> = recs
                .iter()
                .map(|r| {
                    serde_json::json!({
                        "type": match r.kind {
                            MutationKind::ChildList => "childList",
                            MutationKind::Attributes => "attributes",
                            MutationKind::CharacterData => "characterData",
                        },
                        "target": r.target.raw(),
                        "addedNodes": r.added.iter().map(|n| n.raw()).collect::<Vec<u32>>(),
                        "removedNodes": r.removed.iter().map(|n| n.raw()).collect::<Vec<u32>>(),
                        "previousSibling": r.prev_sibling.map(|n| n.raw()),
                        "nextSibling": r.next_sibling.map(|n| n.raw()),
                        "attributeName": r.attr_name,
                        "attributeNamespace": r.attr_namespace,
                        "oldValue": r.old_value,
                    })
                })
                .collect();
            serde_json::to_string(&arr).unwrap_or_else(|_| "[]".into())
        }
        // Phase 0b: live element state (checked / focus) so :checked reflects
        // JS-set state and :focus / activeElement track the focused element.
        "set_checked" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            dom.set_checked(NodeId::new(nid), arg2 == "1");
            "true".into()
        }
        "get_checked" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            if dom.checked(NodeId::new(nid)) { "1".into() } else { "0".into() }
        }
        // Form reset: drop the dirty checkedness override so `checked` follows the
        // `checked` content attribute again.
        "clear_checked" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            dom.clear_checked(NodeId::new(nid));
            "true".into()
        }
        // Checkbox `indeterminate` IDL state (drives `:indeterminate`).
        "set_indeterminate" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            dom.set_indeterminate(NodeId::new(nid), arg2 == "1");
            "true".into()
        }
        "get_indeterminate" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            if dom.indeterminate(NodeId::new(nid)) { "1".into() } else { "0".into() }
        }
        "set_focus" => {
            if arg1.is_empty() {
                // Clears both the focused node and the shadow-host focus chain.
                dom.set_focus(None);
            } else {
                dom.set_focus(Some(NodeId::new(arg1.parse::<u32>().unwrap_or(0))));
                // arg2 = comma-separated shadow-host nids containing the focused
                // element (empty when focus is not inside any shadow tree). These
                // also match `:focus`.
                let hosts: Vec<NodeId> = arg2
                    .split(',')
                    .filter(|s| !s.is_empty())
                    .filter_map(|s| s.parse::<u32>().ok())
                    .map(NodeId::new)
                    .collect();
                dom.set_focus_hosts(hosts);
            }
            "true".into()
        }
        "get_focus" => match dom.focused() {
            Some(n) => n.raw().to_string(),
            None => "-1".into(),
        },
        "set_validity_flags" => {
            // arg1 = "nid:flags,nid:flags,..." — the full snapshot of every
            // validity-bearing element's constraint-validation pseudo bitmask
            // (1=:valid 2=:invalid 4=:in-range 8=:out-of-range). Replaces the map.
            let entries: Vec<(NodeId, u8)> = arg1
                .split(',')
                .filter(|s| !s.is_empty())
                .filter_map(|pair| {
                    let mut it = pair.split(':');
                    let nid = it.next()?.parse::<u32>().ok()?;
                    let flags = it.next()?.parse::<u8>().ok()?;
                    Some((NodeId::new(nid), flags))
                })
                .collect();
            dom.set_validity_state_bulk(&entries);
            "true".into()
        }
        "set_ce_defined" => {
            // arg1 = node id of a custom element that has become "defined" (constructed
            // or successfully upgraded), so `:defined` matches it.
            if let Ok(nid) = arg1.parse::<u32>() {
                dom.set_ce_defined(NodeId::new(nid));
            }
            "true".into()
        }
        "set_ce_states" => {
            // arg1 = node id; arg2 = JSON array of the element's current CustomStateSet
            // strings. Replaces the node's state set (drives `:state(ident)` matching).
            if let Ok(nid) = arg1.parse::<u32>() {
                let states: Vec<String> = serde_json::from_str(&arg2).unwrap_or_default();
                dom.set_ce_states(NodeId::new(nid), states);
            }
            "true".into()
        }
        "set_popover_open" => {
            // arg1 = node id; arg2 = "1" if the popover is showing, else hidden.
            // Drives the `:popover-open` pseudo-class.
            if let Ok(nid) = arg1.parse::<u32>() {
                dom.set_popover_open(NodeId::new(nid), arg2 == "1");
            }
            "true".into()
        }
        "set_dialog_modal" => {
            // arg1 = node id; arg2 = "1" if the dialog is showing as modal, else not.
            // Drives the `:modal` pseudo-class.
            if let Ok(nid) = arg1.parse::<u32>() {
                dom.set_dialog_modal(NodeId::new(nid), arg2 == "1");
            }
            "true".into()
        }
        "set_fullscreen" => {
            // arg1 = node id; arg2 = "1" if the element is in the fullscreen stack.
            // Drives the `:fullscreen` pseudo-class.
            if let Ok(nid) = arg1.parse::<u32>() {
                dom.set_fullscreen(NodeId::new(nid), arg2 == "1");
            }
            "true".into()
        }
        "set_design_mode" => {
            // arg1 = "1" to enable design mode (every element editable → matches
            // :read-write), anything else disables it. Drives :read-write/:read-only.
            dom.set_design_mode(arg1 == "1");
            "true".into()
        }
        "set_target_id" => {
            // arg1 = the queried document's URL fragment (empty clears it). Drives :target.
            dom.set_target_id(if arg1.is_empty() { None } else { Some(arg1.clone()) });
            "true".into()
        }
        "mark_real_document" => {
            // arg1 = a detached/iframe document's backing node id. Lets :root tell a
            // real document's root element from a plain DocumentFragment's child.
            dom.mark_real_document(NodeId::new(arg1.parse::<u32>().unwrap_or(0)));
            "true".into()
        }
        "create_document_fragment" => {
            dom.new_node(NodeData::Document).index().to_string()
        }
        // The <template>'s template-contents node (HTML §the-template-element).
        // The parser stashes a template's children in a separate Document-backed
        // node; expose its id so JS `template.content` can wrap the REAL parsed
        // subtree instead of a disconnected empty fragment. Lazily creates the
        // node for a programmatically-built template that has none yet. Returns
        // "-1" if the target is not an element.
        "template_content" => {
            let nid = NodeId::new(arg1.parse::<u32>().unwrap_or(0));
            let existing = dom.get_node(nid).and_then(|n| match &n.data {
                NodeData::Element { template_contents, .. } => Some(*template_contents),
                _ => None,
            });
            match existing {
                Some(Some(cid)) => cid.index().to_string(),
                Some(None) => {
                    let cid = dom.new_node(NodeData::Document);
                    dom.with_node_mut(nid, |node| {
                        if let NodeData::Element { template_contents, .. } = &mut node.data {
                            *template_contents = Some(cid);
                        }
                    });
                    cid.index().to_string()
                }
                None => "-1".into(),
            }
        }
        "create_element" => {
            dom.new_node(NodeData::Element {
                name: html5ever::QualName::new(None, html5ever::ns!(html), html5ever::LocalName::from(arg1.as_str())),
                attrs: vec![], template_contents: None, mathml_annotation_xml_integration_point: false,
            }).index().to_string()
        }
        // Create an element with a real QualName (namespace + prefix + case-
        // preserved local). arg1 = "<ns>\0<prefix>\0<local>" ("" ns = null
        // namespace, "" prefix = no prefix). Used by createElementNS.
        "create_element_ns" => {
            let parts: Vec<&str> = arg1.splitn(3, '\0').collect();
            let ns = parts.first().copied().unwrap_or("");
            let prefix = parts.get(1).copied().unwrap_or("");
            let local = parts.get(2).copied().unwrap_or("");
            let prefix_opt = if prefix.is_empty() { None } else { Some(html5ever::Prefix::from(prefix)) };
            dom.new_node(NodeData::Element {
                name: html5ever::QualName::new(prefix_opt, html5ever::Namespace::from(ns), html5ever::LocalName::from(local)),
                attrs: vec![], template_contents: None, mathml_annotation_xml_integration_point: false,
            }).index().to_string()
        }
        "create_text_node" => {
            dom.new_node(NodeData::Text { contents: arg1.clone() }).index().to_string()
        }
        "create_comment_node" => {
            dom.new_node(NodeData::Comment { contents: arg1.clone() }).index().to_string()
        }
        "element_children" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let ids: Vec<i32> = dom.children(NodeId::new(nid)).iter()
                .filter(|&&id| dom.get_node(id).map(|n| n.is_element()).unwrap_or(false))
                .map(|id| id.index() as i32).collect();
            serde_json::to_string(&ids).unwrap_or("[]".into())
        }
        // Descendant elements matching a qualified name, in tree order. arg2 =
        // "<qualifiedName>\0<htmlFlag>". For an HTML document, HTML-namespace
        // elements match case-insensitively (compared to the ASCII-lowercased
        // argument) while other namespaces match case-sensitively; "*" matches all.
        "get_elements_by_tag_name" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let (qname, html_flag) = arg2.split_once('\0').unwrap_or((arg2.as_str(), "1"));
            let is_html = html_flag == "1";
            let lowered = qname.to_ascii_lowercase();
            let star = qname == "*";
            let ids: Vec<i32> = dom
                .descendants(NodeId::new(nid))
                .into_iter()
                .filter_map(|id| {
                    dom.get_node(id).and_then(|n| {
                        n.as_element().and_then(|name| {
                            let eqn = match &name.prefix {
                                Some(p) => format!("{}:{}", p.as_ref(), name.local.as_ref()),
                                None => name.local.as_ref().to_string(),
                            };
                            let m = if star {
                                true
                            } else if is_html {
                                if name.ns.as_ref() == "http://www.w3.org/1999/xhtml" {
                                    eqn == lowered
                                } else {
                                    eqn == qname
                                }
                            } else {
                                eqn == qname
                            };
                            if m { Some(id.index() as i32) } else { None }
                        })
                    })
                })
                .collect();
            serde_json::to_string(&ids).unwrap_or("[]".into())
        }
        // Descendant elements matching (namespace, localName); "*" wildcards
        // either part, "" namespace means the null namespace. Case-sensitive.
        "get_elements_by_tag_name_ns" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let (ns, local) = arg2.split_once('\0').unwrap_or(("", arg2.as_str()));
            let ns_star = ns == "*";
            let local_star = local == "*";
            let ids: Vec<i32> = dom
                .descendants(NodeId::new(nid))
                .into_iter()
                .filter_map(|id| {
                    dom.get_node(id).and_then(|n| {
                        n.as_element().and_then(|name| {
                            let ns_match = ns_star || name.ns.as_ref() == ns;
                            let local_match = local_star || name.local.as_ref() == local;
                            if ns_match && local_match { Some(id.index() as i32) } else { None }
                        })
                    })
                })
                .collect();
            serde_json::to_string(&ids).unwrap_or("[]".into())
        }
        // Descendant elements that have ALL of the given (space-separated)
        // classes. Case-sensitive (standards mode).
        "get_elements_by_class_name" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let classes: Vec<&str> = arg2.split_whitespace().collect();
            let ids: Vec<i32> = if classes.is_empty() {
                vec![]
            } else {
                dom.descendants(NodeId::new(nid))
                    .into_iter()
                    .filter_map(|id| {
                        dom.get_node(id).and_then(|n| {
                            if !n.is_element() {
                                return None;
                            }
                            let cls = n.get_attribute("class").unwrap_or("");
                            let have: Vec<&str> = cls.split_whitespace().collect();
                            if classes.iter().all(|c| have.contains(c)) {
                                Some(id.index() as i32)
                            } else {
                                None
                            }
                        })
                    })
                    .collect()
            };
            serde_json::to_string(&ids).unwrap_or("[]".into())
        }
        "has_child_nodes" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            dom.get_node(NodeId::new(nid)).map(|n| n.first_child.is_some()).unwrap_or(false).to_string()
        }
        "contains" => {
            let nid = arg1.parse::<u32>().unwrap_or(0);
            let other = arg2.parse::<u32>().unwrap_or(0);
            dom.descendants(NodeId::new(nid)).contains(&NodeId::new(other)).to_string()
        }
        _ => "null".into(),
    }
}

#[op2(fast)]
fn op_console_msg(state: &OpState, #[string] level: &str, #[string] msg: &str) {
    let _ = state;
    match level {
        "warn" => tracing::warn!(target: "obscura::console", "{}", msg),
        "error" => tracing::error!(target: "obscura::console", "{}", msg),
        _ => tracing::info!(target: "obscura::console", "{}", msg),
    }
}

// op_fetch_url backs JS-level `fetch()` and XHR. Pre-#139 it used a
// process-wide `OnceLock<reqwest::Client>` initialised with no proxy, so
// every JS network call bypassed the configured upstream proxy. We now
// build a client per request, threading whatever `proxy_url` the page's
// ObscuraHttpClient was configured with.
//
// The per-request build cost is negligible (≪1ms) compared with the actual
// network round-trip; the simplification is worth not having to invalidate
// a cache when the proxy is reconfigured between fetches.
fn build_request_client(proxy_url: Option<&str>) -> Result<reqwest::Client, String> {
    // Redirects are followed manually below so each hop can be re-validated
    // against the same SSRF policy as the initial URL (GHSA-8v6v-g4rh-jmcm).
    // With reqwest's default auto-follow, an attacker-controlled origin can
    // 302 to http://127.0.0.1 and read the internal-service body.
    let mut builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
    if let Some(proxy) = proxy_url {
        let p = reqwest::Proxy::all(proxy)
            .map_err(|e| format!("Invalid op_fetch_url proxy '{}': {}", proxy, e))?;
        builder = builder.proxy(p);
    }
    builder
        .build()
        .map_err(|e| format!("failed to build reqwest::Client: {}", e))
}

/// Cap on the number of redirect hops op_fetch_url will follow.
/// Matches reqwest's default policy of 10.
const FETCH_REDIRECT_LIMIT: usize = 10;

/// Turn a JS-side header value into bytes on the wire.
///
/// Two things the obvious `req.header(k, v)` gets wrong, both of which WPT's
/// `fetch/api/headers/header-values*` measure directly:
///
/// 1. **A header value is a ByteString, not a UTF-8 string.** Every code unit is
///    one byte, so `"x\u{e9}x"` is the three bytes `78 E9 78` — not the four that
///    Rust's UTF-8 `as_bytes()` produces. When every char fits in a byte we encode
///    latin-1, which is byte-identical to UTF-8 for the ASCII that internal
///    callers (`Origin`, `Cookie`, …) send, and correct for the rest.
/// 2. **`HeaderValue`'s checked constructor is stricter than HTTP.** Fetch admits
///    every byte except NUL, CR and LF; `http` also refuses the other C0 controls,
///    which made `fetch()` reject with an opaque "builder error" for values Chrome
///    sends without complaint. We re-check the three bytes that actually matter —
///    the ones that would let a value forge a second request — and then bypass the
///    stricter check, rather than failing the whole request over a `\x01`.
fn header_value_bytes(v: &str) -> Option<reqwest::header::HeaderValue> {
    let bytes: Vec<u8> = if v.chars().all(|c| (c as u32) <= 0xFF) {
        v.chars().map(|c| c as u8).collect()
    } else {
        v.as_bytes().to_vec()
    };
    // Header splitting is the whole reason `HeaderValue` validates at all; keep
    // that invariant even on the unchecked path below.
    if bytes.iter().any(|b| matches!(b, 0x00 | b'\r' | b'\n')) {
        return None;
    }
    if let Ok(hv) = reqwest::header::HeaderValue::from_bytes(&bytes) {
        return Some(hv);
    }
    // SAFETY: checked immediately above that the value contains no NUL/CR/LF.
    Some(unsafe { reqwest::header::HeaderValue::from_maybe_shared_unchecked(bytes) })
}

#[op2(async)]
#[string]
async fn op_fetch_url(
    state: Rc<RefCell<OpState>>,
    #[string] url: String,
    #[string] method: String,
    #[string] headers_json: String,
    #[string] body: String,
    #[string] origin: String,
    #[string] mode: String,
) -> Result<String, deno_error::JsErrorBox> {
    tracing::debug!("op_fetch_url called: {} {} (intercept check pending)", method, url);

    if let Ok(parsed_url) = url::Url::parse(&url) {
        // A blocked port is a fetch NETWORK ERROR — reported separately from the
        // policy blocks below, because script must see it as a plain TypeError
        // rather than as an abort.
        if let Some(port) = is_blocked_port(&parsed_url) {
            return Ok(serde_json::json!({
                "status": 0,
                "body": "",
                "url": url,
                "headers": {},
                "blocked": true,
                "portBlocked": true,
                "error": format!("Port {} is blocked", port),
            }).to_string());
        }
        if let Err(e) = validate_fetch_url(&parsed_url) {
            return Ok(serde_json::json!({
                "status": 0,
                "body": "",
                "url": url,
                "headers": {},
                "blocked": true,
                "error": e,
            }).to_string());
        }
    }

    let (cookie_jar, in_flight, intercept_tx, proxy_url) = {
        let state_borrow = state.borrow();
        let gs = state_borrow.borrow::<SharedState>().clone();
        let mut gs = gs.borrow_mut();
        for pattern in &gs.blocked_urls {
            if pattern == "*" || url.contains(pattern) || glob_match(pattern, &url) {
                return Ok(serde_json::json!({
                    "status": 0,
                    "body": "",
                    "url": url,
                    "headers": {},
                    "blocked": true,
                }).to_string());
            }
        }
        let jar = gs.cookie_jar.clone();
        let in_flight = gs.http_client.as_ref().map(|c| c.in_flight.clone());
        // #139: thread the configured proxy through to the per-request
        // reqwest::Client. Without this, op_fetch_url silently bypasses
        // BrowserContext.proxy_url for every JS fetch() / XHR call.
        let proxy_url = gs.http_client.as_ref().and_then(|c| c.proxy_url().map(|s| s.to_string()));
        tracing::debug!("op_fetch_url: intercept_enabled={}, has_tx={}", gs.intercept_enabled, gs.intercept_tx.is_some());
        let itx = if gs.intercept_enabled {
            gs.intercept_counter += 1;
            gs.intercept_tx.clone().map(|tx| (tx, format!("intercept-{}", gs.intercept_counter)))
        } else {
            None
        };
        (jar, in_flight, itx, proxy_url)
    };

    if let Some((tx, request_id)) = intercept_tx {
        let custom_headers: HashMap<String, String> = serde_json::from_str(&headers_json).unwrap_or_default();
        let (resolve_tx, resolve_rx) = tokio::sync::oneshot::channel();
        let intercepted = InterceptedRequest {
            request_id: request_id.clone(),
            url: url.clone(),
            method: method.clone(),
            headers: custom_headers.clone(),
            resource_type: "Fetch".to_string(),
            resolver: resolve_tx,
        };
        if tx.send(intercepted).is_ok() {
            match resolve_rx.await {
                Ok(InterceptResolution::Fulfill { status, headers: h, body: b }) => {
                    let resp_headers: HashMap<String, String> = h;
                    return Ok(serde_json::json!({
                        "status": status,
                        "body": b,
                        "url": url,
                        "headers": resp_headers,
                    }).to_string());
                }
                Ok(InterceptResolution::Fail { reason }) => {
                    return Ok(serde_json::json!({
                        "status": 0,
                        "body": "",
                        "url": url,
                        "headers": {},
                        "blocked": true,
                        "error": reason,
                    }).to_string());
                }
                Ok(InterceptResolution::Continue { url: _new_url, method: _new_method, headers: _new_headers, body: _new_body }) => {
                    tracing::debug!("Interception: continue request {}", url);
                }
                Err(_) => {
                }
            }
        }
    }

    // The actual network round-trip lives in `perform_fetch_core` so the blocking
    // `op_fetch_url_sync` (synchronous XHR) can reuse it from a worker thread.
    perform_fetch_core(
        url, method, headers_json, origin, mode, body, cookie_jar, in_flight, proxy_url,
    )
    .await
    .map_err(deno_error::JsErrorBox::generic)
}

/// The shared network core behind both `op_fetch_url` (async) and
/// `op_fetch_url_sync` (blocking, for synchronous XHR). Builds a per-request
/// reqwest client, runs the CORS preflight when required, follows redirects
/// manually (re-validating every hop against the SSRF policy), threads cookies,
/// and returns the JSON response envelope. Network/transport failures come back
/// as `Err(String)`; policy blocks (SSRF, CORS, redirect-limit) come back as
/// `Ok(json{blocked|corsBlocked})` — identical to the pre-refactor behaviour.
#[allow(clippy::too_many_arguments)]
async fn perform_fetch_core(
    url: String,
    method: String,
    headers_json: String,
    origin: String,
    mode: String,
    body: String,
    cookie_jar: Option<Arc<CookieJar>>,
    in_flight: Option<Arc<std::sync::atomic::AtomicU32>>,
    proxy_url: Option<String>,
) -> Result<String, String> {
    let client = build_request_client(proxy_url.as_deref())?;

    let request_origin = url::Url::parse(&url)
        .ok()
        .map(|u| {
            let host = u.host_str().unwrap_or("");
            match u.port() {
                Some(p) => format!("{}://{}:{}", u.scheme(), host, p),
                None => format!("{}://{}", u.scheme(), host),
            }
        })
        .unwrap_or_default();
    let page_origin = if origin.is_empty() { request_origin.clone() } else { origin.clone() };
    let is_cross_origin = !page_origin.is_empty() && request_origin != page_origin;

    let req_method: reqwest::Method = method.parse().unwrap_or(reqwest::Method::GET);

    let custom_headers: std::collections::HashMap<String, String> =
        serde_json::from_str(&headers_json).unwrap_or_default();

    let needs_preflight = is_cross_origin
        && mode == "cors"
        && (req_method != reqwest::Method::GET
            && req_method != reqwest::Method::HEAD
            && req_method != reqwest::Method::POST
            || custom_headers.keys().any(|k| {
                let kl = k.to_lowercase();
                kl != "accept" && kl != "accept-language" && kl != "content-language"
                    && kl != "content-type"
            }));

    if needs_preflight {
        let preflight = client
            .request(reqwest::Method::OPTIONS, &url)
            .header("Origin", &page_origin)
            .header("Access-Control-Request-Method", method.as_str())
            .header(
                "Access-Control-Request-Headers",
                custom_headers.keys().cloned().collect::<Vec<_>>().join(", "),
            )
            .send()
            .await
            .map_err(|e| format!("CORS preflight failed: {}", e))?;

        let allowed_origin = preflight
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        if allowed_origin != "*" && allowed_origin != page_origin {
            return Err(format!(
                "CORS preflight: Origin '{}' not allowed by Access-Control-Allow-Origin '{}'",
                page_origin, allowed_origin
            ));
        }
    }

    // Follow redirects manually so the SSRF policy applies to every hop.
    // reqwest's auto-follow would bypass validate_fetch_url on the redirect
    // target and let an attacker-allowed origin 302 to http://127.0.0.1
    // (GHSA-8v6v-g4rh-jmcm).
    let mut current_url = url.clone();
    let mut current_method = req_method;
    let mut current_body = body;
    let mut redirects_followed: usize = 0;
    let response = loop {
        let mut req = client.request(current_method.clone(), &current_url);

        if is_cross_origin {
            req = req.header("Origin", &page_origin);
        }

        if !is_cross_origin {
            if let Some(ref jar) = cookie_jar {
                if let Ok(parsed_url) = url::Url::parse(&current_url) {
                    let cookie_header = jar.get_cookie_header(&parsed_url);
                    if !cookie_header.is_empty() {
                        req = req.header("Cookie", &cookie_header);
                    }
                }
            }
        }

        for (k, v) in &custom_headers {
            // A value we cannot represent on the wire (NUL/CR/LF) is dropped
            // rather than failing the request: the JS side already rejected those
            // with a TypeError, so reaching here means an internal caller.
            if let Some(hv) = header_value_bytes(v) {
                req = req.header(k.as_str(), hv);
            }
        }

        if !current_body.is_empty() {
            req = req.body(current_body.clone());
        } else if current_method == reqwest::Method::POST || current_method == reqwest::Method::PUT {
            // Fetch §HTTP-network-or-cache: a null/empty body still emits
            // `Content-Length: 0` for POST and PUT (WPT send-entity-body-*).
            // An empty body alone doesn't reliably surface the header (h2 omits
            // it), so set it explicitly.
            req = req.body(Vec::<u8>::new()).header(reqwest::header::CONTENT_LENGTH, "0");
        }

        if let Some(ref counter) = in_flight {
            counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        }

        let resp = req.send().await.map_err(|e| {
            if let Some(ref counter) = in_flight {
                counter.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
            }
            // reqwest's own Display is just "error sending request for url (…)",
            // which says nothing about WHY. Walk the source chain so a failed
            // fetch reports the actual cause to whoever has to debug it.
            let mut msg = e.to_string();
            let mut src: Option<&(dyn std::error::Error + 'static)> = std::error::Error::source(&e);
            while let Some(s) = src {
                msg.push_str(": ");
                msg.push_str(&s.to_string());
                src = std::error::Error::source(s);
            }
            msg
        })?;

        if let Some(ref counter) = in_flight {
            counter.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
        }

        if let Some(ref jar) = cookie_jar {
            if let Ok(parsed_url) = url::Url::parse(&current_url) {
                for val in resp.headers().get_all(reqwest::header::SET_COOKIE) {
                    if let Ok(s) = val.to_str() {
                        jar.set_cookie(s, &parsed_url);
                    }
                }
            }
        }

        if !resp.status().is_redirection() {
            break resp;
        }

        let location_header = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let Some(location) = location_header else {
            // 3xx without a Location header is not actually a redirect.
            break resp;
        };

        let base = match url::Url::parse(&current_url) {
            Ok(b) => b,
            Err(_) => break resp,
        };
        let next_url = match base.join(&location) {
            Ok(u) => u,
            Err(_) => break resp,
        };

        // Re-validate every redirect target against the SSRF policy.
        if let Err(reason) = validate_fetch_url(&next_url) {
            return Ok(serde_json::json!({
                "status": 0,
                "body": "",
                "url": next_url.to_string(),
                "headers": {},
                "blocked": true,
                "error": format!("Redirect to forbidden URL blocked: {}", reason),
            })
            .to_string());
        }

        redirects_followed += 1;
        if redirects_followed > FETCH_REDIRECT_LIMIT {
            return Ok(serde_json::json!({
                "status": 0,
                "body": "",
                "url": next_url.to_string(),
                "headers": {},
                "blocked": true,
                "error": format!("Too many redirects (>{})", FETCH_REDIRECT_LIMIT),
            })
            .to_string());
        }

        // Browser semantics: 301/302/303 downgrade to GET with no body.
        // 307/308 preserve method and body.
        let status_code = resp.status().as_u16();
        if status_code == 301 || status_code == 302 || status_code == 303 {
            current_method = reqwest::Method::GET;
            current_body.clear();
        }

        current_url = next_url.to_string();
    };

    let status = response.status().as_u16();

    // Decode header values as latin-1, not UTF-8: a header value is a ByteString,
    // so JS must see one code unit per byte. `to_str()` accepts only visible
    // ASCII and we were mapping everything else to the empty string — a response
    // header carrying any byte outside that range simply VANISHED before script
    // could read it.
    let resp_headers: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.as_bytes().iter().map(|b| *b as char).collect::<String>()))
        .collect();

    if is_cross_origin && mode == "cors" {
        let allowed = resp_headers
            .get("access-control-allow-origin")
            .map(|s| s.as_str())
            .unwrap_or("");

        if allowed != "*" && allowed != page_origin {
            return Ok(serde_json::json!({
                "status": 0,
                "body": "",
                "url": url,
                "headers": {},
                "corsBlocked": true,
                "corsError": format!("CORS error: Origin '{}' not in Access-Control-Allow-Origin '{}'", page_origin, allowed),
            })
            .to_string());
        }
    }

    let resp_bytes = response
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    let resp_body = String::from_utf8_lossy(&resp_bytes).to_string();
    let resp_body_base64 = BASE64.encode(&resp_bytes);

    tracing::debug!("op_fetch_url completed: {} {} ({} bytes)", method, url, resp_body.len());

    Ok(serde_json::json!({
        "status": status,
        "body": resp_body,
        "bodyBase64": resp_body_base64,
        "url": url,
        "headers": resp_headers,
    })
    .to_string())
}

// Synchronous XHR (`open(method, url, false)`). The XHR spec blocks the calling
// thread until the response arrives. On the `engine-per-page-threads` model each
// page owns its JS thread, so blocking here freezes only this page — never the
// whole engine. We run the same `perform_fetch_core` on a throwaway worker thread
// (its own current-thread Tokio runtime) and block the JS thread on a channel;
// this avoids re-entering the page's own runtime, which would panic. Request
// interception is intentionally skipped (sync XHR + CDP interception on a single
// thread would deadlock, and WPT never intercepts), but SSRF validation, the
// blocked-URL list, cookies, proxy, and CORS all still apply via the core.
#[op2]
#[string]
fn op_fetch_url_sync(
    state: &mut OpState,
    #[string] url: String,
    #[string] method: String,
    #[string] headers_json: String,
    #[string] body: String,
    #[string] origin: String,
    #[string] mode: String,
) -> Result<String, deno_error::JsErrorBox> {
    if let Ok(parsed_url) = url::Url::parse(&url) {
        if let Err(e) = validate_fetch_url(&parsed_url) {
            return Ok(serde_json::json!({
                "status": 0, "body": "", "url": url, "headers": {},
                "blocked": true, "error": e,
            })
            .to_string());
        }
    }

    let (cookie_jar, in_flight, proxy_url, blocked_urls) = {
        let gs = state.borrow::<SharedState>().clone();
        let gs = gs.borrow();
        (
            gs.cookie_jar.clone(),
            gs.http_client.as_ref().map(|c| c.in_flight.clone()),
            gs.http_client.as_ref().and_then(|c| c.proxy_url().map(|s| s.to_string())),
            gs.blocked_urls.clone(),
        )
    };

    for pattern in &blocked_urls {
        if pattern == "*" || url.contains(pattern) || glob_match(pattern, &url) {
            return Ok(serde_json::json!({
                "status": 0, "body": "", "url": url, "headers": {}, "blocked": true,
            })
            .to_string());
        }
    }

    // Run the async network core to completion on a dedicated worker thread and
    // block the JS thread on the result. `SharedState` holds `Rc`s (not `Send`),
    // so we clone out only the `Send` pieces above before crossing the boundary.
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
            Ok(rt) => rt,
            Err(e) => {
                let _ = tx.send(Err(format!("sync fetch runtime: {}", e)));
                return;
            }
        };
        let res = rt.block_on(perform_fetch_core(
            url, method, headers_json, origin, mode, body, cookie_jar, in_flight, proxy_url,
        ));
        let _ = tx.send(res);
    });

    match rx.recv() {
        Ok(Ok(json)) => Ok(json),
        Ok(Err(e)) => Err(deno_error::JsErrorBox::generic(e)),
        Err(e) => Err(deno_error::JsErrorBox::generic(format!("sync fetch channel: {}", e))),
    }
}

fn glob_match(pattern: &str, url: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if pattern.starts_with('*') && pattern.ends_with('*') {
        return url.contains(&pattern[1..pattern.len() - 1]);
    }
    if pattern.starts_with('*') {
        return url.ends_with(&pattern[1..]);
    }
    if pattern.ends_with('*') {
        return url.starts_with(&pattern[..pattern.len() - 1]);
    }
    url == pattern
}

/// Fetch §port blocking — the ports a browser must never speak HTTP to.
///
/// Every entry is a protocol whose server can be driven by a carefully shaped
/// HTTP request: SMTP (25), IMAP (143), IRC (6667), SSH (22), NFS (2049)… A
/// browser without this list is a cross-protocol attack proxy — a page can post
/// a form whose body is a valid SMTP conversation and mail from the user's own
/// machine. The list is also why the engine no longer HANGS on these ports: we
/// used to open the connection and wait, so one `fetch()` could wedge a tab.
///
/// Sorted ascending — `binary_search` depends on it.
const BLOCKED_PORTS: &[u16] = &[
    0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101,
    102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427,
    465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990,
    993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667,
    6668, 6669, 6679, 6697, 10080,
];

/// Whether a URL names a port fetch must refuse. `url.port()` is `None` for the
/// scheme's default port (80/443), which is never on the list.
fn is_blocked_port(url: &url::Url) -> Option<u16> {
    let port = url.port()?;
    BLOCKED_PORTS.binary_search(&port).ok().map(|_| port)
}

fn validate_fetch_url(url: &url::Url) -> Result<(), String> {
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" && scheme != "file" {
        return Err(format!(
            "Forbidden URL scheme '{}' - only http, https, and file are allowed",
            scheme
        ));
    }

    if scheme == "file" {
        return Ok(());
    }

    if let Some(host) = url.host() {
        match host {
            url::Host::Ipv4(ip) => {
                if ip.is_loopback()
                    || ip.is_private()
                    || ip.is_link_local()
                    || ip.is_broadcast()
                    || ip.is_documentation()
                {
                    return Err(format!(
                        "Access to private/internal IP address {} is not allowed",
                        ip
                    ));
                }
            }
            url::Host::Ipv6(ip) => {
                if ip.is_loopback() || ip.is_unicast_link_local() {
                    return Err(format!(
                        "Access to private/internal IPv6 address {} is not allowed",
                        ip
                    ));
                }
            }
            url::Host::Domain(domain) => {
                let lower_domain = domain.to_lowercase();
                if lower_domain == "localhost"
                    || lower_domain.ends_with(".localhost")
                    || lower_domain == "127.0.0.1"
                    || lower_domain == "::1"
                {
                    return Err(format!(
                        "Access to localhost domain '{}' is not allowed",
                        domain
                    ));
                }
            }
        }
    }

    Ok(())
}

#[op2]
#[string]
fn op_get_cookies(state: &OpState) -> String {
    let gs = state.borrow::<SharedState>().clone();
    let gs = gs.borrow();
    let jar = match &gs.cookie_jar {
        Some(j) => j,
        None => return String::new(),
    };
    let url = match url::Url::parse(&gs.url) {
        Ok(u) => u,
        Err(_) => return String::new(),
    };
    jar.get_js_visible_cookies(&url)
}

#[op2(fast)]
fn op_set_cookie(state: &OpState, #[string] cookie_str: &str) {
    let gs = state.borrow::<SharedState>().clone();
    let gs = gs.borrow();
    let jar = match &gs.cookie_jar {
        Some(j) => j,
        None => return,
    };
    let url = match url::Url::parse(&gs.url) {
        Ok(u) => u,
        Err(_) => return,
    };
    jar.set_cookie_from_js(cookie_str, &url);
}

// Cookies for a URL that is NOT the page's own — an <iframe> has its own document
// URL, and cookie visibility is decided by path, so a frame at
// `/cookies/resources/` must not be shown a cookie scoped to `/cookies/attributes/`.
// `document.cookie` inside a frame used to be hardcoded to "" (there was no way to
// ask about another URL), which silently emptied every cookie read a frame made.
#[op2]
#[string]
fn op_get_cookies_for(state: &OpState, #[string] for_url: &str) -> String {
    let gs = state.borrow::<SharedState>().clone();
    let gs = gs.borrow();
    let jar = match &gs.cookie_jar {
        Some(j) => j,
        None => return String::new(),
    };
    let url = match url::Url::parse(for_url) {
        Ok(u) => u,
        Err(_) => return String::new(),
    };
    jar.get_js_visible_cookies(&url)
}

#[op2(fast)]
fn op_set_cookie_for(state: &OpState, #[string] for_url: &str, #[string] cookie_str: &str) {
    let gs = state.borrow::<SharedState>().clone();
    let gs = gs.borrow();
    let jar = match &gs.cookie_jar {
        Some(j) => j,
        None => return,
    };
    if let Ok(url) = url::Url::parse(for_url) {
        jar.set_cookie_from_js(cookie_str, &url);
    }
}

// WPT's whole `cookies/` realm gates on `test_driver.delete_all_cookies()`, and a
// page cannot clear a cookie it cannot see (one set for a different path never
// appears in `document.cookie`). This op reaches the jar directly; it is a
// test-driver primitive, deliberately not reachable from ordinary page script.
#[op2(fast)]
fn op_clear_cookies(state: &OpState) {
    let gs = state.borrow::<SharedState>().clone();
    let gs = gs.borrow();
    if let Some(jar) = &gs.cookie_jar {
        jar.clear();
    }
}

#[op2(fast)]
fn op_navigate(state: &OpState, #[string] url: &str, #[string] method: &str, #[string] body: &str) {
    let gs = state.borrow::<SharedState>().clone();
    let mut gs = gs.borrow_mut();
    gs.url = url.to_string();
    gs.pending_navigation = Some((url.to_string(), method.to_string(), body.to_string()));
}

#[op2(async)]
async fn op_sleep(#[number] millis: u64) {
    tokio::time::sleep(std::time::Duration::from_millis(millis)).await;
}

/// Compute a URL's origin per WHATWG. The `url` crate returns the inner origin
/// for ANY blob: inner scheme, but the spec only adopts the inner origin when it
/// is http(s) — otherwise (blob:ftp/ws/wss/blob, parse failure) the origin is
/// opaque ("null").
fn url_origin(u: &url::Url) -> String {
    if u.scheme() == "blob" {
        return match url::Url::parse(u.path()) {
            Ok(inner) if inner.scheme() == "http" || inner.scheme() == "https" => {
                inner.origin().ascii_serialization()
            }
            _ => "null".to_string(),
        };
    }
    u.origin().ascii_serialization()
}

/// Serialize a parsed URL's WHATWG components to JSON (shared by parse + set).
fn url_components_json(u: &url::Url) -> String {
    let host_with_port = match (u.host_str(), u.port()) {
        (Some(h), Some(p)) => format!("{}:{}", h, p),
        (Some(h), None) => h.to_string(),
        _ => String::new(),
    };
    // WHATWG: the `search`/`hash` getters are "" for a null OR EMPTY query/fragment
    // (the leading ?/# only appears when non-empty), even though href keeps a
    // trailing ?/# the input had.
    let search = match u.query() {
        Some(q) if !q.is_empty() => format!("?{}", q),
        _ => String::new(),
    };
    let hash = match u.fragment() {
        Some(f) if !f.is_empty() => format!("#{}", f),
        _ => String::new(),
    };

    // --- Path-serialization fix-ups for rust-url vs WHATWG divergences ---
    // The path ends at the first query/fragment delimiter in the serialized href.
    let mut href = u.as_str().to_string();
    let mut pathname = u.path().to_string();
    let path_end = href.find(|c| c == '?' || c == '#').unwrap_or(href.len());

    if u.cannot_be_a_base() {
        // Opaque path: the WHATWG opaque-path serializer percent-encodes a single
        // trailing U+0020 — the last char before ?/#/EOF — as %20. rust-url keeps
        // the literal space ONLY when a query/fragment follows (it trims a pure
        // trailing space at EOF), so only the delimited cases are recoverable here.
        if pathname.ends_with(' ') {
            pathname.truncate(pathname.len() - 1);
            pathname.push_str("%20");
        }
        let scheme_end = u.scheme().len() + 1; // index past the ':'
        if path_end > scheme_end && href.as_bytes()[path_end - 1] == b' ' {
            href.replace_range(path_end - 1..path_end, "%20");
        }
    } else {
        // Non-opaque path: rust-url's path percent-encode set omits U+005E (^);
        // WHATWG encodes it. A bare ^ can only occur in the path (scheme/authority/
        // port never hold a literal ^), so encode it across the path region only —
        // a ^ in the query/fragment stays literal.
        if pathname.contains('^') {
            pathname = pathname.replace('^', "%5E");
        }
        if href[..path_end].contains('^') {
            let fixed = href[..path_end].replace('^', "%5E");
            href.replace_range(..path_end, &fixed);
        }
    }

    serde_json::json!({
        "valid": true,
        "href": href,
        "protocol": format!("{}:", u.scheme()),
        "host": host_with_port,
        "hostname": u.host_str().unwrap_or(""),
        "port": u.port().map(|p| p.to_string()).unwrap_or_default(),
        "pathname": pathname,
        "search": search,
        "hash": hash,
        "origin": url_origin(u),
        "username": u.username(),
        "password": u.password().unwrap_or(""),
    })
    .to_string()
}

/// WHATWG URL parsing backing the JS `URL` class. Uses the `url` crate (real
/// spec parser) instead of a regex. Returns the components as JSON; `valid:false`
/// (so JS throws TypeError) when the input can't be parsed (with the given base).
#[op2]
#[string]
fn op_url_parse(#[string] input: String, #[string] base: String) -> String {
    let parsed = if base.is_empty() {
        url::Url::parse(&input)
    } else {
        match url::Url::parse(&base) {
            Ok(b) => {
                let rel = collapse_special_authority_slashes(&input, &b);
                b.join(&rel)
            }
            Err(e) => Err(e),
        }
    };
    match parsed {
        Ok(u) => url_components_json(&u),
        Err(_) => "{\"valid\":false}".to_string(),
    }
}

/// WHATWG "special authority ignore slashes state": for a special (non-`file`)
/// base, a scheme-relative reference starting with 3+ leading slashes/backslashes
/// skips ALL of them before reading the authority — so `///host` ≡ `//host`.
/// rust-url instead rejects the 3+-slash form (empty host), so collapse the leading
/// slash/backslash run to exactly `//`. `file:` has distinct slash semantics
/// (extra slashes are preserved as path) and is left untouched.
fn collapse_special_authority_slashes(input: &str, base: &url::Url) -> String {
    if !url_is_special(base.scheme()) || base.scheme() == "file" {
        return input.to_string();
    }
    let run = input
        .chars()
        .take_while(|c| *c == '/' || *c == '\\')
        .count();
    if run >= 3 {
        format!("//{}", &input[run..])
    } else {
        input.to_string()
    }
}

fn url_is_special(scheme: &str) -> bool {
    matches!(scheme, "http" | "https" | "ws" | "wss" | "ftp" | "file")
}

/// Truncate a `host` setter value at the first /?# delimiter (\ too for special
/// schemes); the remainder (host[:port]) is split separately.
fn truncate_host(value: &str, special: bool) -> &str {
    let mut end = value.len();
    for (i, c) in value.char_indices() {
        if c == '/' || c == '?' || c == '#' || (special && c == '\\') {
            end = i;
            break;
        }
    }
    &value[..end]
}

/// Split "host[:port]" honoring an [IPv6] literal; returns (host, port-digits?).
fn split_host_port(v: &str) -> (&str, Option<&str>) {
    if v.starts_with('[') {
        if let Some(rb) = v.find(']') {
            return (&v[..=rb], v[rb + 1..].strip_prefix(':'));
        }
    }
    match v.find(':') {
        Some(i) => (&v[..i], Some(&v[i + 1..])),
        None => (v, None),
    }
}

/// `hostname` setter value: like `truncate_host` but `:` also stops (outside an
/// [IPv6] literal) since hostname carries no port.
fn hostname_prefix(value: &str, special: bool) -> &str {
    if value.starts_with('[') {
        if let Some(rb) = value.find(']') {
            return &value[..=rb];
        }
    }
    let mut end = value.len();
    for (i, c) in value.char_indices() {
        if c == '/' || c == '?' || c == '#' || c == ':' || (special && c == '\\') {
            end = i;
            break;
        }
    }
    &value[..end]
}

/// Apply the WHATWG port-parser: leading ASCII digits, set if any.
fn set_port_from(u: &mut url::Url, raw: &str) {
    let digits: String = raw.chars().take_while(|c| c.is_ascii_digit()).collect();
    if !digits.is_empty() {
        if let Ok(p) = digits.parse::<u16>() {
            let _ = u.set_port(Some(p));
        }
    }
}

/// WHATWG URL component setters (url.protocol = ..., url.host = ..., etc.) backing
/// the JS `URL` accessor setters. Re-parses `href`, applies the `url` crate setter
/// for `part`, and returns the updated components. A setter that the spec rejects
/// is a no-op (the url crate returns Err) — we keep the prior value, never throw.
#[op2]
#[string]
fn op_url_set(#[string] href: String, #[string] part: String, #[string] value: String) -> String {
    // NOTE: tab (U+0009) / LF (U+000A) / CR (U+000D) stripping is now applied
    // PER-PART inside `apply_url_setter` — WHATWG only strips for the setters that
    // re-run the basic URL parser (protocol/host/hostname/port/pathname/search/
    // hash); the username/password setters percent-encode the value directly, so
    // a tab/newline there becomes %09/%0A/%0D (not removed).
    // The `url` crate's setters can panic internally on some adversarial inputs
    // (e.g. an empty host that corrupts internal offsets — url-2.5.8 lib.rs:2881).
    // Catch it so a URL setter can NEVER abort the process; a panic = no-op setter.
    let applied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut u = match url::Url::parse(&href) {
            Ok(u) => u,
            Err(_) => return None,
        };
        apply_url_setter(&mut u, &part, &value);
        Some(url_components_json(&u))
    }));
    match applied {
        Ok(Some(json)) => json,
        Ok(None) => "{\"valid\":false}".to_string(),
        Err(_) => url::Url::parse(&href)
            .map(|u| url_components_json(&u))
            .unwrap_or_else(|_| "{\"valid\":false}".to_string()),
    }
}

/// Remove all ASCII tab/LF/CR — the basic URL parser's first step, applied to the
/// parser-based component setters (not username/password, which encode directly).
fn strip_tab_newline(v: &str) -> String {
    v.chars().filter(|c| *c != '\t' && *c != '\n' && *c != '\r').collect()
}

fn apply_url_setter(u: &mut url::Url, part: &str, raw: &str) {
    match part {
        // The userinfo setters DON'T strip tab/newline — they UTF-8 percent-encode
        // the value with the userinfo encode set, so \t/\n/\r become %09/%0A/%0D.
        "username" => {
            let _ = u.set_username(raw);
        }
        "password" => {
            let _ = u.set_password(if raw.is_empty() { None } else { Some(raw) });
        }
        // Port state: the LITERAL empty string clears the port; a value that is
        // only tab/newline (empty after stripping but non-empty raw) is a no-op,
        // per the basic URL parser's port state with state override.
        "port" => {
            if raw.is_empty() {
                let _ = u.set_port(None);
            } else {
                let v = strip_tab_newline(raw);
                if !v.is_empty() {
                    set_port_from(u, &v);
                }
            }
        }
        _ => {
            let value = strip_tab_newline(raw);
            match part {
                "protocol" => {
                    // Accept "https", "https:", "https:..." — scheme is up to the ':'.
                    let scheme = value.split(':').next().unwrap_or("");
                    let _ = u.set_scheme(scheme);
                }
                "hostname" => {
                    if !u.cannot_be_a_base() {
                        let special = url_is_special(u.scheme());
                        // hostname state rejects a ':' (host-invalid-code-point) →
                        // the WHOLE setter fails, leaving the host unchanged. (An
                        // [IPv6] literal legitimately contains ':'.)
                        let candidate = truncate_host(&value, special);
                        if !candidate.starts_with('[') && candidate.contains(':') {
                            return;
                        }
                        let v = hostname_prefix(&value, special);
                        if v.is_empty() {
                            if !special {
                                let _ = u.set_host(None);
                            }
                        } else {
                            let _ = u.set_host(Some(v));
                        }
                    }
                }
                "host" => {
                    // WHATWG host setter: stop at the first /?# (and \ for special),
                    // then split host[:port] (IPv6-aware); port parser takes digits.
                    if !u.cannot_be_a_base() {
                        let special = url_is_special(u.scheme());
                        let v = truncate_host(&value, special);
                        if v.is_empty() {
                            if !special {
                                let _ = u.set_host(None);
                            }
                        } else {
                            let (host, port) = split_host_port(v);
                            if u.set_host(Some(host)).is_ok() {
                                if let Some(ps) = port {
                                    set_port_from(u, ps);
                                }
                            }
                        }
                    }
                }
                "pathname" => {
                    // Opaque-path URLs (mailto:, data:, sc:original) can't be set.
                    if !u.cannot_be_a_base() {
                        u.set_path(&value);
                    }
                }
                "search" => {
                    let q = value.strip_prefix('?').unwrap_or(&value);
                    u.set_query(if value.is_empty() { None } else { Some(q) });
                }
                "hash" => {
                    let f = value.strip_prefix('#').unwrap_or(&value);
                    u.set_fragment(if value.is_empty() { None } else { Some(f) });
                }
                _ => {}
            }
        }
    }
}

/// Decode bytes per the WHATWG Encoding Standard using `encoding_rs` (Gecko's
/// reference implementation), covering the legacy single-byte and multi-byte
/// encodings the JS `TextDecoder` can't table-decode itself (ISO-8859-*, KOI8,
/// windows-125x, Big5, gbk/gb18030, EUC-jp/kr, Shift_JIS, ISO-2022-JP, …).
///
/// `name` is the already-resolved WHATWG encoding name. utf-8/utf-16/x-user-defined
/// stay in JS; `replacement` never reaches here (the constructor throws). BOM
/// handling is intentionally off — legacy encodings have no BOM, and the JS side
/// owns BOM stripping for the utf encodings.
///
/// When `fatal` is set and the input is malformed, returns Err so the JS caller
/// can throw a `TypeError`; otherwise errors become U+FFFD via replacement.
///
/// `stream` selects the decoder's `last` flag (`last = !stream`). Streaming is
/// stateless across calls: the JS side feeds the whole accumulated buffer each
/// time and slices off the newly-emitted suffix. With `last == false` the
/// decoder holds back any incomplete trailing sequence, so decoding a growing
/// prefix only ever *extends* the prior output — which makes that suffix diff
/// correct without persisting a `Decoder` between op calls.
#[op2]
#[string]
fn op_text_decode(
    #[string] name: String,
    #[buffer] data: &[u8],
    fatal: bool,
    stream: bool,
) -> Result<String, deno_error::JsErrorBox> {
    use encoding_rs::DecoderResult;
    let enc = encoding_rs::Encoding::for_label_no_replacement(name.as_bytes())
        .ok_or_else(|| deno_error::JsErrorBox::generic(format!("unknown encoding: {name}")))?;
    let last = !stream;
    let mut decoder = enc.new_decoder_without_bom_handling();
    if fatal {
        let cap = decoder
            .max_utf8_buffer_length_without_replacement(data.len())
            .unwrap_or(data.len() * 4 + 16);
        let mut out = String::with_capacity(cap);
        let (res, _read) = decoder.decode_to_string_without_replacement(data, &mut out, last);
        match res {
            DecoderResult::InputEmpty => Ok(out),
            _ => Err(deno_error::JsErrorBox::generic("decode error")),
        }
    } else {
        let cap = decoder
            .max_utf8_buffer_length(data.len())
            .unwrap_or(data.len() * 4 + 16);
        let mut out = String::with_capacity(cap);
        let (_res, _read, _had) = decoder.decode_to_string(data, &mut out, last);
        Ok(out)
    }
}

pub fn build_extension() -> Extension {
    Extension {
        name: "obscura_dom",
        ops: std::borrow::Cow::Owned(vec![
            op_dom(),
            op_console_msg(),
            op_fetch_url(),
            op_fetch_url_sync(),
            op_get_cookies(),
            op_set_cookie(),
            op_clear_cookies(),
            op_get_cookies_for(),
            op_set_cookie_for(),
            op_navigate(),
            op_sleep(),
            op_url_parse(),
            op_url_set(),
            op_text_decode(),
        ]),
        ..Default::default()
    }
}
