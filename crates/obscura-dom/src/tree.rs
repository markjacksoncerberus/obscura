use html5ever::{LocalName, Namespace, Prefix, QualName};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct NodeId(pub(crate) u32);

impl NodeId {
    pub fn new(val: u32) -> Self {
        NodeId(val)
    }

    pub fn index(self) -> usize {
        self.0 as usize
    }

    pub fn raw(self) -> u32 {
        self.0
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "NodeId({})", self.0)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Attribute {
    pub name: QualName,
    pub value: String,
}

impl Attribute {
    /// The attribute's qualified name: `prefix:local` when a prefix is present,
    /// otherwise just the local name. This is the DOM `Attr.name` / `nodeName`.
    pub fn qualified_name(&self) -> String {
        match &self.name.prefix {
            Some(p) => format!("{}:{}", p.as_ref(), self.name.local.as_ref()),
            None => self.name.local.as_ref().to_string(),
        }
    }
}

#[derive(Clone, Debug)]
pub enum NodeData {
    Document,
    Doctype {
        name: String,
        public_id: String,
        system_id: String,
    },
    Element {
        name: QualName,
        attrs: Vec<Attribute>,
        template_contents: Option<NodeId>,
        mathml_annotation_xml_integration_point: bool,
    },
    Text {
        contents: String,
    },
    Comment {
        contents: String,
    },
    ProcessingInstruction {
        target: String,
        data: String,
    },
}

#[derive(Clone, Debug)]
pub struct Node {
    pub id: NodeId,
    pub parent: Option<NodeId>,
    pub first_child: Option<NodeId>,
    pub last_child: Option<NodeId>,
    pub prev_sibling: Option<NodeId>,
    pub next_sibling: Option<NodeId>,
    pub data: NodeData,
}

impl Node {
    pub fn is_document(&self) -> bool {
        matches!(self.data, NodeData::Document)
    }

    pub fn is_element(&self) -> bool {
        matches!(self.data, NodeData::Element { .. })
    }

    pub fn is_text(&self) -> bool {
        matches!(self.data, NodeData::Text { .. })
    }

    pub fn as_element(&self) -> Option<&QualName> {
        match &self.data {
            NodeData::Element { name, .. } => Some(name),
            _ => None,
        }
    }

    pub fn attrs(&self) -> Option<&[Attribute]> {
        match &self.data {
            NodeData::Element { attrs, .. } => Some(attrs),
            _ => None,
        }
    }

    pub fn attrs_mut(&mut self) -> Option<&mut Vec<Attribute>> {
        match &mut self.data {
            NodeData::Element { attrs, .. } => Some(attrs),
            _ => None,
        }
    }

    pub fn get_attribute(&self, name: &str) -> Option<&str> {
        self.attrs()?.iter().find_map(|a| {
            if a.name.local.as_ref() == name {
                Some(a.value.as_str())
            } else {
                None
            }
        })
    }

    pub fn set_attribute(&mut self, name: &str, value: String) {
        if let NodeData::Element { attrs, .. } = &mut self.data {
            if let Some(attr) = attrs.iter_mut().find(|a| a.name.local.as_ref() == name) {
                attr.value = value;
            } else {
                attrs.push(Attribute {
                    name: QualName::new(None, Namespace::default(), LocalName::from(name)),
                    value,
                });
            }
        }
    }

    // --- Namespace- and qualified-name-aware attribute access (DOM Attr model).
    // The Rust `Attribute` already carries a full `QualName` (ns/prefix/local);
    // these methods key on it so an element can hold several attributes that
    // share a local name but differ in namespace (per the DOM spec). The plain
    // `get_attribute`/`set_attribute` above stay keyed by local name for the
    // selector engine and serializer, which only ever look up bare locals.

    /// First attribute whose qualified name (`prefix:local` or `local`) equals
    /// `qname`. This is what `Element.getAttribute(qualifiedName)` resolves to.
    pub fn get_attribute_qualified(&self, qname: &str) -> Option<&str> {
        self.attrs()?
            .iter()
            .find(|a| a.qualified_name() == qname)
            .map(|a| a.value.as_str())
    }

    /// Set the value of the first attribute matching `qname`, or append a new
    /// null-namespace attribute whose local name is the whole `qname`.
    pub fn set_attribute_qualified(&mut self, qname: &str, value: String) {
        if let NodeData::Element { attrs, .. } = &mut self.data {
            if let Some(attr) = attrs.iter_mut().find(|a| a.qualified_name() == qname) {
                attr.value = value;
            } else {
                attrs.push(Attribute {
                    name: QualName::new(None, Namespace::default(), LocalName::from(qname)),
                    value,
                });
            }
        }
    }

    /// Remove the first attribute matching the qualified name `qname`.
    pub fn remove_attribute_qualified(&mut self, qname: &str) {
        if let NodeData::Element { attrs, .. } = &mut self.data {
            if let Some(pos) = attrs.iter().position(|a| a.qualified_name() == qname) {
                attrs.remove(pos);
            }
        }
    }

    /// First attribute matching (namespace, local name). The empty string for
    /// `ns` denotes the null namespace. Matching is case-sensitive.
    pub fn get_attribute_ns(&self, ns: &str, local: &str) -> Option<&str> {
        self.attrs()?
            .iter()
            .find(|a| a.name.ns.as_ref() == ns && a.name.local.as_ref() == local)
            .map(|a| a.value.as_str())
    }

    /// Set the (namespace, local) attribute, replacing the value of an existing
    /// match (keeping its prefix, per spec) or appending a new attribute.
    pub fn set_attribute_ns(&mut self, ns: &str, prefix: Option<&str>, local: &str, value: String) {
        if let NodeData::Element { attrs, .. } = &mut self.data {
            if let Some(attr) = attrs
                .iter_mut()
                .find(|a| a.name.ns.as_ref() == ns && a.name.local.as_ref() == local)
            {
                attr.value = value;
            } else {
                attrs.push(Attribute {
                    name: QualName::new(
                        prefix.map(Prefix::from),
                        Namespace::from(ns),
                        LocalName::from(local),
                    ),
                    value,
                });
            }
        }
    }

    /// Remove the first attribute matching (namespace, local name).
    pub fn remove_attribute_ns(&mut self, ns: &str, local: &str) {
        if let NodeData::Element { attrs, .. } = &mut self.data {
            if let Some(pos) = attrs
                .iter()
                .position(|a| a.name.ns.as_ref() == ns && a.name.local.as_ref() == local)
            {
                attrs.remove(pos);
            }
        }
    }

    pub fn text_content_of_text_node(&self) -> Option<&str> {
        match &self.data {
            NodeData::Text { contents } => Some(contents),
            _ => None,
        }
    }
}

/// The shape of a DOM mutation, mirroring the parts of a DOM `MutationRecord`
/// the JS bridge needs. Phase 0c: the Rust tree is the authoritative source of
/// mutations, so `MutationObserver` fires regardless of whether a mutation came
/// from a JS wrapper method or directly from a Rust/CDP code path.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MutationKind {
    ChildList,
    Attributes,
    CharacterData,
}

#[derive(Clone, Debug)]
pub struct MutationRecord {
    pub kind: MutationKind,
    pub target: NodeId,
    pub added: Vec<NodeId>,
    pub removed: Vec<NodeId>,
    pub prev_sibling: Option<NodeId>,
    pub next_sibling: Option<NodeId>,
    pub attr_name: Option<String>,
    /// The mutated attribute's namespace (DOM `MutationRecord.attributeNamespace`).
    /// `None` for null-namespace attributes and for non-attribute records.
    pub attr_namespace: Option<String>,
    pub old_value: Option<String>,
}

pub struct DomTree {
    inner: RefCell<DomTreeInner>,
}

pub(crate) struct DomTreeInner {
    pub(crate) nodes: Vec<Option<Node>>,
    pub(crate) free_list: Vec<u32>,
    pub(crate) document: NodeId,
    pub(crate) id_index: HashMap<String, NodeId>,
    // Phase 0c: Rust-side mutation queue. Gated by `mutations_enabled` (off by
    // default) so the queue only grows while a consumer — a registered JS
    // MutationObserver, via the bridge — is draining it. Avoids both a memory
    // leak and double-firing alongside the legacy JS-instrumented path until
    // the bridge switches over to draining this.
    pub(crate) mutations_enabled: bool,
    pub(crate) pending_mutations: Vec<MutationRecord>,
    // Atomic childList batching (DOM "queue a tree mutation record"). A compound
    // operation — `replaceChild`, a DocumentFragment insertion, `textContent` /
    // `innerHTML` / `replaceChildren` replace-all — must emit ONE childList record
    // for the parent (added ∪ removed), not one per low-level primitive. While
    // `suppress_mutations > 0` the primitive recorders (append_child / insert_before
    // / detach) skip pushing their per-step childList records; the JS high-level
    // method then synthesizes the single spec-shaped record via
    // `record_childlist_mutation`. A depth counter (not a bool) so nested compound
    // ops compose. Attribute/characterData records are unaffected.
    pub(crate) suppress_mutations: u32,
    // Phase 0b: dynamic element state that doesn't live in attributes. Kept in
    // side maps so we never touch the `Node` literal (constructed in many
    // places). `checked_state` overrides the `checked` attribute default once
    // JS sets `el.checked`; `focused` is the single focused element.
    pub(crate) checked_state: HashMap<NodeId, bool>,
    // The `indeterminate` IDL state of checkboxes (set by JS `el.indeterminate =
    // …`). Unlike `checked`, it has no content-attribute default, so a missing
    // entry means false. Read by `:indeterminate` for checkbox inputs.
    pub(crate) indeterminate_state: HashMap<NodeId, bool>,
    pub(crate) focused: Option<NodeId>,
    // The id named by the current document's URL fragment, for `:target`. JS sets
    // it from the queried document's URL right before a `:target` query.
    pub(crate) target_id: Option<String>,
    // Live constraint-validation selector state, set by JS right before a
    // `:valid`/`:invalid`/`:in-range`/`:out-of-range` query (the Rust matcher
    // can't call back into the JS validity engine). A per-node bitmask:
    // 1 = :valid, 2 = :invalid, 4 = :in-range, 8 = :out-of-range. Treated as a
    // query-time snapshot — replaced wholesale on each prime so stale entries
    // never linger.
    pub(crate) validity_state: HashMap<NodeId, u8>,
    // Whether the document is in design mode (`document.designMode = "on"`). When
    // set, every element is editable, so plain elements match `:read-write` (and
    // none match `:read-only`). A document-global flag JS pushes on assignment.
    pub(crate) design_mode: bool,
    // Nodes that are *real documents* (detached/iframe documents). They share the
    // create_document_fragment backing (NodeData::Document) with plain
    // DocumentFragments, so this set is how `:root` tells "document element of a
    // document" from "root of a fragment". The main document (NodeId 0) is always real.
    pub(crate) real_documents: HashSet<NodeId>,
}

impl DomTree {
    pub fn new() -> Self {
        let doc_node = Node {
            id: NodeId(0),
            parent: None,
            first_child: None,
            last_child: None,
            prev_sibling: None,
            next_sibling: None,
            data: NodeData::Document,
        };
        DomTree {
            inner: RefCell::new(DomTreeInner {
                nodes: vec![Some(doc_node)],
                free_list: Vec::new(),
                document: NodeId(0),
                id_index: HashMap::new(),
                mutations_enabled: false,
                pending_mutations: Vec::new(),
                suppress_mutations: 0,
                checked_state: HashMap::new(),
                indeterminate_state: HashMap::new(),
                focused: None,
                target_id: None,
                validity_state: HashMap::new(),
                design_mode: false,
                real_documents: HashSet::new(),
            }),
        }
    }

    pub fn document(&self) -> NodeId {
        self.inner.borrow().document
    }

    pub(crate) fn borrow_inner(&self) -> std::cell::Ref<'_, DomTreeInner> {
        self.inner.borrow()
    }

    /// Turn Rust-side mutation recording on/off. Off clears any queued records.
    /// The JS bridge enables this while at least one MutationObserver is active.
    pub fn set_mutation_recording(&self, on: bool) {
        let mut inner = self.inner.borrow_mut();
        inner.mutations_enabled = on;
        if !on {
            inner.pending_mutations.clear();
        }
    }

    pub fn is_recording_mutations(&self) -> bool {
        self.inner.borrow().mutations_enabled
    }

    /// Take and clear the queued mutation records (delivered to JS observers).
    pub fn drain_mutations(&self) -> Vec<MutationRecord> {
        std::mem::take(&mut self.inner.borrow_mut().pending_mutations)
    }

    /// Phase 0b: dynamic checked state. Set when JS assigns `el.checked`.
    pub fn set_checked(&self, id: NodeId, checked: bool) {
        self.inner.borrow_mut().checked_state.insert(id, checked);
    }

    /// Resolve an element's checked state: the JS-set state if present, else the
    /// `checked` attribute default. Used by `:checked` and the checked getter.
    pub fn checked(&self, id: NodeId) -> bool {
        let inner = self.inner.borrow();
        if let Some(&c) = inner.checked_state.get(&id) {
            return c;
        }
        inner
            .nodes
            .get(id.index())
            .and_then(|n| n.as_ref())
            .map(|n| n.get_attribute("checked").is_some())
            .unwrap_or(false)
    }

    /// Set a checkbox's `indeterminate` IDL state (drives `:indeterminate`).
    pub fn set_indeterminate(&self, id: NodeId, indeterminate: bool) {
        self.inner.borrow_mut().indeterminate_state.insert(id, indeterminate);
    }

    /// A checkbox's `indeterminate` IDL state. No content-attribute default, so a
    /// node JS never touched is not indeterminate.
    pub fn indeterminate(&self, id: NodeId) -> bool {
        self.inner.borrow().indeterminate_state.get(&id).copied().unwrap_or(false)
    }

    /// Replace the live constraint-validation selector state wholesale. JS
    /// computes the bitmask for every validity-bearing element in the document
    /// and pushes the full set right before a `:valid`/`:invalid`/`:in-range`/
    /// `:out-of-range` query, so the map is always a fresh snapshot.
    pub fn set_validity_state_bulk(&self, entries: &[(NodeId, u8)]) {
        let mut inner = self.inner.borrow_mut();
        inner.validity_state.clear();
        for (id, flags) in entries {
            inner.validity_state.insert(*id, *flags);
        }
    }

    /// The validity bitmask JS last pushed for this node (0 = none of the
    /// constraint-validation pseudo-classes apply).
    pub fn validity_state(&self, id: NodeId) -> u8 {
        self.inner.borrow().validity_state.get(&id).copied().unwrap_or(0)
    }

    /// Set whether the document is in design mode (drives `:read-write`/`:read-only`).
    pub fn set_design_mode(&self, on: bool) {
        self.inner.borrow_mut().design_mode = on;
    }

    /// Whether the document is in design mode (every element is then editable).
    pub fn design_mode(&self) -> bool {
        self.inner.borrow().design_mode
    }

    /// Phase 0b: the focused element (drives `:focus` and `document.activeElement`).
    pub fn set_focus(&self, id: Option<NodeId>) {
        self.inner.borrow_mut().focused = id;
    }

    /// The id named by the current document's URL fragment, for `:target`. An
    /// empty string clears it (no fragment → `:target` matches nothing).
    pub fn set_target_id(&self, value: Option<String>) {
        self.inner.borrow_mut().target_id = value.filter(|s| !s.is_empty());
    }

    pub fn target_id(&self) -> Option<String> {
        self.inner.borrow().target_id.clone()
    }

    /// Mark a node as a real document (detached/iframe document) so `:root` can
    /// distinguish it from a plain DocumentFragment with the same backing kind.
    pub fn mark_real_document(&self, id: NodeId) {
        self.inner.borrow_mut().real_documents.insert(id);
    }

    /// Whether `id` is a real document: the main document, or one explicitly marked.
    pub fn is_real_document(&self, id: NodeId) -> bool {
        let inner = self.inner.borrow();
        id == inner.document || inner.real_documents.contains(&id)
    }

    pub fn focused(&self) -> Option<NodeId> {
        self.inner.borrow().focused
    }

    /// Record an attribute mutation. Called from the op layer, which performs
    /// attribute writes via `with_node_mut` rather than a child-list method.
    pub fn record_attribute_mutation(
        &self,
        target: NodeId,
        name: &str,
        namespace: Option<String>,
        old_value: Option<String>,
    ) {
        let mut inner = self.inner.borrow_mut();
        if inner.mutations_enabled {
            inner.pending_mutations.push(MutationRecord {
                kind: MutationKind::Attributes,
                target,
                added: Vec::new(),
                removed: Vec::new(),
                prev_sibling: None,
                next_sibling: None,
                attr_name: Some(name.to_string()),
                attr_namespace: namespace,
                old_value,
            });
        }
    }

    /// Record a characterData (text/comment contents) mutation.
    pub fn record_character_data_mutation(&self, target: NodeId, old_value: Option<String>) {
        let mut inner = self.inner.borrow_mut();
        if inner.mutations_enabled {
            inner.pending_mutations.push(MutationRecord {
                kind: MutationKind::CharacterData,
                target,
                added: Vec::new(),
                removed: Vec::new(),
                prev_sibling: None,
                next_sibling: None,
                attr_name: None,
                attr_namespace: None,
                old_value,
            });
        }
    }

    /// Begin/end a childList-record suppression scope (see `suppress_mutations`).
    /// While suppressed, `append_child`/`insert_before`/`detach` skip their
    /// per-primitive childList records; the caller synthesizes the single
    /// spec-shaped record via `record_childlist_mutation`. Nesting-safe.
    pub fn push_suppress_mutations(&self) {
        self.inner.borrow_mut().suppress_mutations += 1;
    }
    pub fn pop_suppress_mutations(&self) {
        let mut inner = self.inner.borrow_mut();
        inner.suppress_mutations = inner.suppress_mutations.saturating_sub(1);
    }

    /// Push one synthesized childList mutation record for a compound operation
    /// (the DOM "queue a tree mutation record" with the full added ∪ removed set).
    /// Recorded regardless of the suppress depth — it IS the replacement for the
    /// suppressed per-primitive records — but still only while recording is on.
    pub fn record_childlist_mutation(
        &self,
        target: NodeId,
        added: Vec<NodeId>,
        removed: Vec<NodeId>,
        prev_sibling: Option<NodeId>,
        next_sibling: Option<NodeId>,
    ) {
        let mut inner = self.inner.borrow_mut();
        if inner.mutations_enabled {
            inner.pending_mutations.push(MutationRecord {
                kind: MutationKind::ChildList,
                target,
                added,
                removed,
                prev_sibling,
                next_sibling,
                attr_name: None,
                attr_namespace: None,
                old_value: None,
            });
        }
    }

    pub fn new_node(&self, data: NodeData) -> NodeId {
        let mut inner = self.inner.borrow_mut();
        let id = if let Some(slot) = inner.free_list.pop() {
            NodeId(slot)
        } else {
            let idx = inner.nodes.len() as u32;
            inner.nodes.push(None);
            NodeId(idx)
        };

        if let NodeData::Element { ref attrs, .. } = data {
            if let Some(id_attr) = attrs.iter().find(|a| a.name.local.as_ref() == "id") {
                inner.id_index.insert(id_attr.value.clone(), id);
            }
        }

        inner.nodes[id.index()] = Some(Node {
            id,
            parent: None,
            first_child: None,
            last_child: None,
            prev_sibling: None,
            next_sibling: None,
            data,
        });
        id
    }

    pub fn get_node(&self, id: NodeId) -> Option<Node> {
        self.inner.borrow().nodes.get(id.index())?.clone()
    }

    pub fn with_node<F, R>(&self, id: NodeId, f: F) -> Option<R>
    where
        F: FnOnce(&Node) -> R,
    {
        let inner = self.inner.borrow();
        inner.nodes.get(id.index())?.as_ref().map(f)
    }

    pub fn with_node_mut<F, R>(&self, id: NodeId, f: F) -> Option<R>
    where
        F: FnOnce(&mut Node) -> R,
    {
        let mut inner = self.inner.borrow_mut();
        inner.nodes.get_mut(id.index())?.as_mut().map(f)
    }

    pub fn append_child(&self, parent_id: NodeId, child_id: NodeId) {
        self.detach(child_id);

        let mut inner = self.inner.borrow_mut();

        let old_last = inner
            .nodes
            .get(parent_id.index())
            .and_then(|n| n.as_ref())
            .and_then(|n| n.last_child);

        if let Some(Some(child)) = inner.nodes.get_mut(child_id.index()) {
            child.parent = Some(parent_id);
            child.prev_sibling = old_last;
            child.next_sibling = None;
        }

        if let Some(old_last_id) = old_last {
            if let Some(Some(old_last_node)) = inner.nodes.get_mut(old_last_id.index()) {
                old_last_node.next_sibling = Some(child_id);
            }
        }

        if let Some(Some(parent)) = inner.nodes.get_mut(parent_id.index()) {
            if parent.first_child.is_none() {
                parent.first_child = Some(child_id);
            }
            parent.last_child = Some(child_id);
        }

        // Phase 0c: childList addition (appended after the previous last child).
        if inner.mutations_enabled && inner.suppress_mutations == 0 {
            inner.pending_mutations.push(MutationRecord {
                kind: MutationKind::ChildList,
                target: parent_id,
                added: vec![child_id],
                removed: Vec::new(),
                prev_sibling: old_last,
                next_sibling: None,
                attr_name: None,
                attr_namespace: None,
                old_value: None,
            });
        }
    }

    pub fn insert_before(&self, existing_id: NodeId, new_sibling_id: NodeId) {
        let (parent_id, prev_id) = {
            let inner = self.inner.borrow();
            let node = match inner
                .nodes
                .get(existing_id.index())
                .and_then(|n| n.as_ref())
            {
                Some(n) => n,
                None => return,
            };
            match node.parent {
                Some(p) => (p, node.prev_sibling),
                None => return,
            }
        };

        self.detach(new_sibling_id);

        let mut inner = self.inner.borrow_mut();

        if let Some(Some(node)) = inner.nodes.get_mut(new_sibling_id.index()) {
            node.parent = Some(parent_id);
            node.prev_sibling = prev_id;
            node.next_sibling = Some(existing_id);
        }

        if let Some(Some(node)) = inner.nodes.get_mut(existing_id.index()) {
            node.prev_sibling = Some(new_sibling_id);
        }

        if let Some(prev) = prev_id {
            if let Some(Some(node)) = inner.nodes.get_mut(prev.index()) {
                node.next_sibling = Some(new_sibling_id);
            }
        } else if let Some(Some(parent)) = inner.nodes.get_mut(parent_id.index()) {
            parent.first_child = Some(new_sibling_id);
        }

        // Phase 0c: childList addition, inserted before `existing_id`.
        if inner.mutations_enabled && inner.suppress_mutations == 0 {
            inner.pending_mutations.push(MutationRecord {
                kind: MutationKind::ChildList,
                target: parent_id,
                added: vec![new_sibling_id],
                removed: Vec::new(),
                prev_sibling: prev_id,
                next_sibling: Some(existing_id),
                attr_name: None,
                attr_namespace: None,
                old_value: None,
            });
        }
    }

    pub fn detach(&self, node_id: NodeId) {
        let mut inner = self.inner.borrow_mut();

        let (parent_id, prev_id, next_id) =
            match inner.nodes.get(node_id.index()).and_then(|n| n.as_ref()) {
                Some(node) => (node.parent, node.prev_sibling, node.next_sibling),
                None => return,
            };

        if let Some(prev) = prev_id {
            if let Some(Some(node)) = inner.nodes.get_mut(prev.index()) {
                node.next_sibling = next_id;
            }
        } else if let Some(parent_id) = parent_id {
            if let Some(Some(parent)) = inner.nodes.get_mut(parent_id.index()) {
                parent.first_child = next_id;
            }
        }

        if let Some(next) = next_id {
            if let Some(Some(node)) = inner.nodes.get_mut(next.index()) {
                node.prev_sibling = prev_id;
            }
        } else if let Some(parent_id) = parent_id {
            if let Some(Some(parent)) = inner.nodes.get_mut(parent_id.index()) {
                parent.last_child = prev_id;
            }
        }

        if let Some(Some(node)) = inner.nodes.get_mut(node_id.index()) {
            node.parent = None;
            node.prev_sibling = None;
            node.next_sibling = None;
        }

        // Phase 0c: a detach from a real parent is a childList removal. Siblings
        // were captured above, before the unlink. (Detaching an already-orphan
        // node returned early, so `parent_id` here means it had a parent.)
        if inner.mutations_enabled && inner.suppress_mutations == 0 {
            if let Some(parent) = parent_id {
                inner.pending_mutations.push(MutationRecord {
                    kind: MutationKind::ChildList,
                    target: parent,
                    added: Vec::new(),
                    removed: vec![node_id],
                    prev_sibling: prev_id,
                    next_sibling: next_id,
                    attr_name: None,
                    attr_namespace: None,
                    old_value: None,
                });
            }
        }
    }

    /// Detach a node from its parent AND remove it (and all descendants)
    /// from the id-index so that `getElementById` no longer returns them.
    /// Unlike `remove()`, this does NOT free the nodes — the JS side may
    /// still hold references to the wrappers.
    pub fn remove_child(&self, node_id: NodeId) {
        // Collect all id attribute values in the subtree. We snapshot them
        // before detaching so `get_attribute` can still see the tree.
        let ids_to_remove: Vec<String> = {
            let descendants = self.descendants(node_id);
            let inner = self.inner.borrow();
            let mut ids: Vec<String> = Vec::new();
            if let Some(Some(node)) = inner.nodes.get(node_id.index()) {
                if let Some(id_val) = node.get_attribute("id") {
                    ids.push(id_val.to_string());
                }
            }
            for desc_id in &descendants {
                if let Some(Some(node)) = inner.nodes.get(desc_id.index()) {
                    if let Some(id_val) = node.get_attribute("id") {
                        ids.push(id_val.to_string());
                    }
                }
            }
            ids
        };

        self.detach(node_id);

        let mut inner = self.inner.borrow_mut();
        for id_str in &ids_to_remove {
            inner.id_index.remove(id_str);
        }
    }

    pub fn remove(&self, node_id: NodeId) {
        self.detach(node_id);
        let descendants = self.descendants(node_id);
        let mut inner = self.inner.borrow_mut();

        let mut ids_to_remove = Vec::new();
        for &desc_id in &descendants {
            if let Some(Some(node)) = inner.nodes.get(desc_id.index()) {
                if let Some(id_val) = node.get_attribute("id") {
                    ids_to_remove.push(id_val.to_string());
                }
            }
        }
        if let Some(Some(node)) = inner.nodes.get(node_id.index()) {
            if let Some(id_val) = node.get_attribute("id") {
                ids_to_remove.push(id_val.to_string());
            }
        }

        for id_str in ids_to_remove {
            inner.id_index.remove(&id_str);
        }

        for desc_id in descendants {
            inner.nodes[desc_id.index()] = None;
            inner.free_list.push(desc_id.0);
        }
        inner.nodes[node_id.index()] = None;
        inner.free_list.push(node_id.0);
    }

    pub fn children(&self, node_id: NodeId) -> Vec<NodeId> {
        let inner = self.inner.borrow();
        let mut result = Vec::new();
        let mut current = inner
            .nodes
            .get(node_id.index())
            .and_then(|n| n.as_ref())
            .and_then(|n| n.first_child);
        while let Some(child_id) = current {
            result.push(child_id);
            current = inner
                .nodes
                .get(child_id.index())
                .and_then(|n| n.as_ref())
                .and_then(|n| n.next_sibling);
        }
        result
    }

    pub fn descendants(&self, node_id: NodeId) -> Vec<NodeId> {
        let inner = self.inner.borrow();
        let mut result = Vec::new();
        let mut stack = Vec::new();

        let mut first = inner
            .nodes
            .get(node_id.index())
            .and_then(|n| n.as_ref())
            .and_then(|n| n.first_child);
        let mut children_to_push = Vec::new();
        while let Some(child_id) = first {
            children_to_push.push(child_id);
            first = inner
                .nodes
                .get(child_id.index())
                .and_then(|n| n.as_ref())
                .and_then(|n| n.next_sibling);
        }
        for child_id in children_to_push.into_iter().rev() {
            stack.push(child_id);
        }

        while let Some(current) = stack.pop() {
            result.push(current);

            let mut child = inner
                .nodes
                .get(current.index())
                .and_then(|n| n.as_ref())
                .and_then(|n| n.first_child);
            let mut children_to_push = Vec::new();
            while let Some(child_id) = child {
                children_to_push.push(child_id);
                child = inner
                    .nodes
                    .get(child_id.index())
                    .and_then(|n| n.as_ref())
                    .and_then(|n| n.next_sibling);
            }
            for child_id in children_to_push.into_iter().rev() {
                stack.push(child_id);
            }
        }

        result
    }

    pub fn ancestors(&self, node_id: NodeId) -> Vec<NodeId> {
        let inner = self.inner.borrow();
        let mut result = Vec::new();
        let mut current = inner
            .nodes
            .get(node_id.index())
            .and_then(|n| n.as_ref())
            .and_then(|n| n.parent);
        while let Some(parent_id) = current {
            result.push(parent_id);
            current = inner
                .nodes
                .get(parent_id.index())
                .and_then(|n| n.as_ref())
                .and_then(|n| n.parent);
        }
        result
    }

    pub fn get_element_by_id(&self, id: &str) -> Option<NodeId> {
        // DOM §dom-document-getelementbyid: return the FIRST element, in tree
        // order, among the document's descendants whose ID is `id`. An element's
        // ID is its non-empty `id` attribute — so the empty string never matches.
        //
        // We walk the live tree (pre-order) rather than consulting a stored index:
        // an index keyed by id can neither honour tree order across duplicate ids
        // nor stay live across innerHTML/outerHTML/subtree mutations. Walking from
        // the document root also gives connectedness for free — a detached element
        // (appended to a fragment or another orphan, not to the document) is simply
        // not reachable, so it is correctly excluded.
        if id.is_empty() {
            return None;
        }
        let inner = self.inner.borrow();
        let mut stack: Vec<NodeId> = Vec::new();
        push_children_rev(&inner, inner.document, &mut stack);
        while let Some(cur) = stack.pop() {
            if let Some(Some(node)) = inner.nodes.get(cur.index()) {
                if let NodeData::Element { ref attrs, .. } = node.data {
                    if attrs
                        .iter()
                        .any(|a| a.name.local.as_ref() == "id" && a.value.as_str() == id)
                    {
                        return Some(cur);
                    }
                }
                push_children_rev(&inner, cur, &mut stack);
            }
        }
        None
    }

    pub fn text_content(&self, node_id: NodeId) -> String {
        let inner = self.inner.borrow();
        // A CharacterData node's textContent is its OWN data. For Element /
        // Document / DocumentFragment it is the concatenation of descendant Text
        // nodes (excluding Comment/PI), which collect_text_inner handles.
        if let Some(Some(node)) = inner.nodes.get(node_id.index()) {
            match &node.data {
                NodeData::Text { contents } | NodeData::Comment { contents } => return contents.clone(),
                NodeData::ProcessingInstruction { data, .. } => return data.clone(),
                _ => {}
            }
        }
        let mut result = String::new();
        collect_text_inner(&inner, node_id, &mut result);
        result
    }

    pub fn append_text(&self, parent_id: NodeId, text: &str) {
        let last_child_is_text = {
            let inner = self.inner.borrow();
            inner
                .nodes
                .get(parent_id.index())
                .and_then(|n| n.as_ref())
                .and_then(|n| n.last_child)
                .and_then(|lc| inner.nodes.get(lc.index()))
                .and_then(|n| n.as_ref())
                .map(|n| n.is_text())
                .unwrap_or(false)
        };

        if last_child_is_text {
            let last_child_id = {
                let inner = self.inner.borrow();
                inner
                    .nodes
                    .get(parent_id.index())
                    .and_then(|n| n.as_ref())
                    .and_then(|n| n.last_child)
                    .unwrap()
            };
            let mut inner = self.inner.borrow_mut();
            if let Some(Some(node)) = inner.nodes.get_mut(last_child_id.index()) {
                if let NodeData::Text { contents } = &mut node.data {
                    contents.push_str(text);
                    return;
                }
            }
        }

        let text_id = self.new_node(NodeData::Text {
            contents: text.to_string(),
        });
        self.append_child(parent_id, text_id);
    }

    pub fn find_body_or_root(&self) -> NodeId {
        let doc = self.document();
        for child in self.children(doc) {
            if let Some(n) = self.get_node(child) {
                if n.as_element()
                    .map(|name| name.local.as_ref() == "html")
                    .unwrap_or(false)
                {
                    for html_child in self.children(child) {
                        if let Some(hc) = self.get_node(html_child) {
                            if hc
                                .as_element()
                                .map(|name| name.local.as_ref() == "body")
                                .unwrap_or(false)
                            {
                                return html_child;
                            }
                        }
                    }
                    return child;
                }
            }
        }
        doc
    }

    pub fn import_children_from(&self, parent_id: NodeId, source: &DomTree, source_node: NodeId) {
        let source_children = source.children(source_node);
        for source_child_id in source_children {
            self.import_node_from(parent_id, source, source_child_id);
        }
    }

    fn import_node_from(&self, parent_id: NodeId, source: &DomTree, source_node_id: NodeId) {
        let node_data = {
            let source_inner = source.inner.borrow();
            match source_inner.nodes.get(source_node_id.index()) {
                Some(Some(node)) => node.data.clone(),
                _ => return,
            }
        };

        let new_id = self.new_node(node_data);
        self.append_child(parent_id, new_id);

        let children = source.children(source_node_id);
        for child_id in children {
            self.import_node_from(new_id, source, child_id);
        }
    }

    pub fn len(&self) -> usize {
        self.inner
            .borrow()
            .nodes
            .iter()
            .filter(|n| n.is_some())
            .count()
    }

    pub fn is_empty(&self) -> bool {
        self.len() <= 1
    }

    pub fn update_id_index(&self, node_id: NodeId, old_id: Option<&str>, new_id: Option<&str>) {
        let mut inner = self.inner.borrow_mut();
        if let Some(old) = old_id {
            inner.id_index.remove(old);
        }
        if let Some(new) = new_id {
            inner.id_index.insert(new.to_string(), node_id);
        }
    }
}

/// Push `parent`'s children onto `stack` in reverse document order, so that a
/// `stack.pop()`-driven loop visits them left-to-right (a pre-order / tree-order
/// traversal). Used by `get_element_by_id`.
fn push_children_rev(inner: &DomTreeInner, parent: NodeId, stack: &mut Vec<NodeId>) {
    let start = stack.len();
    let mut child = inner
        .nodes
        .get(parent.index())
        .and_then(|n| n.as_ref())
        .and_then(|n| n.first_child);
    while let Some(child_id) = child {
        stack.push(child_id);
        child = inner
            .nodes
            .get(child_id.index())
            .and_then(|n| n.as_ref())
            .and_then(|n| n.next_sibling);
    }
    stack[start..].reverse();
}

fn collect_text_inner(inner: &DomTreeInner, node_id: NodeId, buf: &mut String) {
    if let Some(Some(node)) = inner.nodes.get(node_id.index()) {
        match &node.data {
            NodeData::Text { contents } => buf.push_str(contents),
            _ => {
                let mut child = node.first_child;
                while let Some(child_id) = child {
                    collect_text_inner(inner, child_id, buf);
                    child = inner
                        .nodes
                        .get(child_id.index())
                        .and_then(|n| n.as_ref())
                        .and_then(|n| n.next_sibling);
                }
            }
        }
    }
}

impl Default for DomTree {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_tree_has_document() {
        let tree = DomTree::new();
        assert_eq!(tree.len(), 1);
        let node = tree.get_node(tree.document()).unwrap();
        assert!(node.is_document());
    }

    #[test]
    fn test_append_child() {
        let tree = DomTree::new();
        let child = tree.new_node(NodeData::Text {
            contents: "hello".into(),
        });
        let doc = tree.document();
        tree.append_child(doc, child);

        assert_eq!(tree.len(), 2);
        let doc_node = tree.get_node(doc).unwrap();
        assert_eq!(doc_node.first_child, Some(child));
        assert_eq!(doc_node.last_child, Some(child));

        let child_node = tree.get_node(child).unwrap();
        assert_eq!(child_node.parent, Some(doc));
    }

    #[test]
    fn test_multiple_children() {
        let tree = DomTree::new();
        let doc = tree.document();
        let c1 = tree.new_node(NodeData::Text {
            contents: "a".into(),
        });
        let c2 = tree.new_node(NodeData::Text {
            contents: "b".into(),
        });
        let c3 = tree.new_node(NodeData::Text {
            contents: "c".into(),
        });
        tree.append_child(doc, c1);
        tree.append_child(doc, c2);
        tree.append_child(doc, c3);

        assert_eq!(tree.children(doc), vec![c1, c2, c3]);
    }

    #[test]
    fn test_detach() {
        let tree = DomTree::new();
        let doc = tree.document();
        let c1 = tree.new_node(NodeData::Text {
            contents: "a".into(),
        });
        let c2 = tree.new_node(NodeData::Text {
            contents: "b".into(),
        });
        tree.append_child(doc, c1);
        tree.append_child(doc, c2);

        tree.detach(c1);
        assert_eq!(tree.children(doc), vec![c2]);
    }

    #[test]
    fn phase0c_rust_mutations_are_recorded_only_when_enabled() {
        let tree = DomTree::new();
        let doc = tree.document();

        // Disabled by default: a mutation records nothing (no leak / no double
        // fire alongside the JS-instrumented path).
        let pre = tree.new_node(NodeData::Text { contents: "x".into() });
        tree.append_child(doc, pre);
        assert!(tree.drain_mutations().is_empty());

        // Enabled: childList add → one record with the right shape.
        tree.set_mutation_recording(true);
        let c1 = tree.new_node(NodeData::Text { contents: "a".into() });
        tree.append_child(doc, c1);
        let recs = tree.drain_mutations();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].kind, MutationKind::ChildList);
        assert_eq!(recs[0].target, doc);
        assert_eq!(recs[0].added, vec![c1]);
        assert!(recs[0].removed.is_empty());
        assert_eq!(recs[0].prev_sibling, Some(pre)); // appended after `pre`

        // Drain clears the queue.
        assert!(tree.drain_mutations().is_empty());

        // Detach of a real child → one childList removal record.
        tree.detach(c1);
        let recs = tree.drain_mutations();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].kind, MutationKind::ChildList);
        assert_eq!(recs[0].target, doc);
        assert_eq!(recs[0].removed, vec![c1]);
        assert!(recs[0].added.is_empty());

        // insert_before → addition with the right next-sibling.
        let c2 = tree.new_node(NodeData::Text { contents: "b".into() });
        tree.insert_before(pre, c2);
        let recs = tree.drain_mutations();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].added, vec![c2]);
        assert_eq!(recs[0].next_sibling, Some(pre));

        // Turning recording off clears any queue and stops recording.
        tree.set_mutation_recording(false);
        let c3 = tree.new_node(NodeData::Text { contents: "c".into() });
        tree.append_child(doc, c3);
        assert!(tree.drain_mutations().is_empty());
    }

    #[test]
    fn test_insert_before() {
        let tree = DomTree::new();
        let doc = tree.document();
        let c1 = tree.new_node(NodeData::Text {
            contents: "a".into(),
        });
        let c2 = tree.new_node(NodeData::Text {
            contents: "b".into(),
        });
        let c3 = tree.new_node(NodeData::Text {
            contents: "c".into(),
        });
        tree.append_child(doc, c1);
        tree.append_child(doc, c3);
        tree.insert_before(c3, c2);

        assert_eq!(tree.children(doc), vec![c1, c2, c3]);
    }

    #[test]
    fn test_text_content() {
        let tree = DomTree::new();
        let doc = tree.document();
        let div = tree.new_node(NodeData::Element {
            name: QualName::new(None, ns!(html), local_name!("div")),
            attrs: vec![],
            template_contents: None,
            mathml_annotation_xml_integration_point: false,
        });
        tree.append_child(doc, div);

        let t1 = tree.new_node(NodeData::Text {
            contents: "Hello ".into(),
        });
        let t2 = tree.new_node(NodeData::Text {
            contents: "World".into(),
        });
        tree.append_child(div, t1);
        tree.append_child(div, t2);

        assert_eq!(tree.text_content(div), "Hello World");
    }

    #[test]
    fn test_get_element_by_id() {
        let tree = DomTree::new();
        let doc = tree.document();
        let div = tree.new_node(NodeData::Element {
            name: QualName::new(None, ns!(html), local_name!("div")),
            attrs: vec![Attribute {
                name: QualName::new(None, Namespace::default(), LocalName::from("id")),
                value: "main".into(),
            }],
            template_contents: None,
            mathml_annotation_xml_integration_point: false,
        });
        tree.append_child(doc, div);

        assert_eq!(tree.get_element_by_id("main"), Some(div));
        assert_eq!(tree.get_element_by_id("nonexistent"), None);
    }

    #[test]
    fn test_append_text_merges() {
        let tree = DomTree::new();
        let doc = tree.document();
        tree.append_text(doc, "Hello ");
        tree.append_text(doc, "World");

        assert_eq!(tree.children(doc).len(), 1);
        assert_eq!(tree.text_content(doc), "Hello World");
    }

    #[test]
    fn test_remove_subtree() {
        let tree = DomTree::new();
        let doc = tree.document();
        let div = tree.new_node(NodeData::Element {
            name: QualName::new(None, ns!(html), local_name!("div")),
            attrs: vec![],
            template_contents: None,
            mathml_annotation_xml_integration_point: false,
        });
        tree.append_child(doc, div);
        let text = tree.new_node(NodeData::Text {
            contents: "hi".into(),
        });
        tree.append_child(div, text);

        assert_eq!(tree.len(), 3);
        tree.remove(div);
        assert_eq!(tree.len(), 1);
    }
}
