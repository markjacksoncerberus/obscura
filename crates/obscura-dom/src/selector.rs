use cssparser::{CowRcStr, ToCss};
use html5ever::{LocalName, Namespace};
use precomputed_hash::PrecomputedHash;
use selectors::attr::{AttrSelectorOperation, CaseSensitivity, NamespaceConstraint};
use selectors::bloom::BloomFilter;
use selectors::context::QuirksMode;
use selectors::matching::{
    ElementSelectorFlags, MatchingContext, MatchingForInvalidation, MatchingMode,
    NeedsSelectorFlags,
};
use selectors::parser::{self, ParseRelative, SelectorParseErrorKind};
use selectors::visitor::SelectorVisitor;
use selectors::{Element, OpaqueElement, SelectorList};

use crate::tree::{DomTree, NodeData, NodeId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObscuraSelector;

impl parser::SelectorImpl for ObscuraSelector {
    type ExtraMatchingData<'a> = ();
    type AttrValue = CssString;
    type Identifier = CssString;
    type LocalName = CssLocalName;
    type NamespaceUrl = CssNamespace;
    type NamespacePrefix = CssString;
    type BorrowedLocalName = CssLocalName;
    type BorrowedNamespaceUrl = CssNamespace;
    type NonTSPseudoClass = PseudoClass;
    type PseudoElement = PseudoElement;
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CssString(pub String);

impl<'a> From<&'a str> for CssString {
    fn from(s: &'a str) -> Self {
        CssString(s.to_string())
    }
}

impl AsRef<str> for CssString {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl ToCss for CssString {
    fn to_css<W: std::fmt::Write>(&self, dest: &mut W) -> std::fmt::Result {
        cssparser::serialize_string(&self.0, dest)
    }
}

impl PrecomputedHash for CssString {
    fn precomputed_hash(&self) -> u32 {
        let mut h: u32 = 5381;
        for b in self.0.as_bytes() {
            h = h.wrapping_mul(33).wrapping_add(*b as u32);
        }
        h
    }
}

impl Default for CssString {
    fn default() -> Self {
        CssString(String::new())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CssLocalName(pub LocalName);

impl<'a> From<&'a str> for CssLocalName {
    fn from(s: &'a str) -> Self {
        CssLocalName(LocalName::from(s))
    }
}

impl ToCss for CssLocalName {
    fn to_css<W: std::fmt::Write>(&self, dest: &mut W) -> std::fmt::Result {
        dest.write_str(&self.0)
    }
}

impl PrecomputedHash for CssLocalName {
    fn precomputed_hash(&self) -> u32 {
        self.0.precomputed_hash()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct CssNamespace(pub Namespace);

impl PrecomputedHash for CssNamespace {
    fn precomputed_hash(&self) -> u32 {
        self.0.precomputed_hash()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PseudoClass {
    Hover,
    Active,
    Focus,
    Enabled,
    Disabled,
    Checked,
    /// `:link` / `:any-link` — a/area/link with an href. (We have no browsing
    /// history, so every link is unvisited and :link == :any-link.)
    Link,
    /// `:visited` — never matches (no history; also the privacy-safe default).
    Visited,
    /// `:lang(en, fr, …)` — matched against the element's language (its nearest
    /// ancestor-or-self `lang` attribute), per the CSS prefix rule.
    Lang(Vec<String>),
    /// A standard CSS pseudo-class we accept as valid (so querySelector does not
    /// throw) but don't implement matching for — it never matches.
    Other(String),
}

/// Standard CSS pseudo-class names that are syntactically valid (so a selector
/// using them must NOT throw), beyond the ones we actively match. Genuinely
/// unknown names are rejected (-> SyntaxError) by the parser.
fn is_known_pseudo_class(name: &str) -> bool {
    matches!(
        name,
        "link" | "visited" | "any-link" | "local-link" | "target" | "target-within"
            | "focus-within" | "focus-visible" | "indeterminate" | "default" | "required"
            | "optional" | "valid" | "invalid" | "in-range" | "out-of-range" | "read-only"
            | "read-write" | "placeholder-shown" | "autofill" | "current" | "past" | "future"
            | "playing" | "paused" | "user-invalid" | "user-valid" | "blank" | "defined"
            | "fullscreen" | "modal" | "picture-in-picture" | "popover-open" | "open"
            | "muted" | "volume-locked" | "seeking" | "buffering" | "stalled"
    )
}

impl parser::NonTSPseudoClass for PseudoClass {
    type Impl = ObscuraSelector;

    fn is_active_or_hover(&self) -> bool {
        matches!(self, PseudoClass::Hover | PseudoClass::Active)
    }

    fn is_user_action_state(&self) -> bool {
        matches!(
            self,
            PseudoClass::Hover | PseudoClass::Active | PseudoClass::Focus
        )
    }

    fn visit<V>(&self, _visitor: &mut V) -> bool
    where
        V: SelectorVisitor<Impl = Self::Impl>,
    {
        true
    }
}

impl ToCss for PseudoClass {
    fn to_css<W: std::fmt::Write>(&self, dest: &mut W) -> std::fmt::Result {
        match self {
            PseudoClass::Hover => dest.write_str(":hover"),
            PseudoClass::Active => dest.write_str(":active"),
            PseudoClass::Focus => dest.write_str(":focus"),
            PseudoClass::Enabled => dest.write_str(":enabled"),
            PseudoClass::Disabled => dest.write_str(":disabled"),
            PseudoClass::Checked => dest.write_str(":checked"),
            PseudoClass::Link => dest.write_str(":link"),
            PseudoClass::Visited => dest.write_str(":visited"),
            PseudoClass::Lang(langs) => {
                dest.write_str(":lang(")?;
                for (i, l) in langs.iter().enumerate() {
                    if i > 0 {
                        dest.write_str(", ")?;
                    }
                    dest.write_str(l)?;
                }
                dest.write_str(")")
            }
            PseudoClass::Other(name) => {
                dest.write_str(":")?;
                dest.write_str(name)
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PseudoElement {
    Before,
    After,
    FirstLine,
    FirstLetter,
    // ::slotted(<compound-selector>) — a functional pseudo-element. We parse and
    // retain its argument text but never match it (it only ever matches assigned
    // nodes inside a shadow tree, which we don't model), so a selector using it
    // parses successfully and selects nothing — what WPT expects (vs. throwing).
    Slotted(String),
}

impl parser::PseudoElement for PseudoElement {
    type Impl = ObscuraSelector;
}

impl ToCss for PseudoElement {
    fn to_css<W: std::fmt::Write>(&self, dest: &mut W) -> std::fmt::Result {
        match self {
            PseudoElement::Before => dest.write_str("::before"),
            PseudoElement::After => dest.write_str("::after"),
            PseudoElement::FirstLine => dest.write_str("::first-line"),
            PseudoElement::FirstLetter => dest.write_str("::first-letter"),
            PseudoElement::Slotted(arg) => {
                dest.write_str("::slotted(")?;
                dest.write_str(arg)?;
                dest.write_str(")")
            }
        }
    }
}

pub struct ObscuraSelectorParser;

impl<'i> parser::Parser<'i> for ObscuraSelectorParser {
    type Impl = ObscuraSelector;
    type Error = SelectorParseErrorKind<'i>;

    fn parse_non_ts_pseudo_class(
        &self,
        _location: cssparser::SourceLocation,
        name: CowRcStr<'i>,
    ) -> Result<PseudoClass, cssparser::ParseError<'i, Self::Error>> {
        match name.as_ref() {
            "hover" => Ok(PseudoClass::Hover),
            "active" => Ok(PseudoClass::Active),
            "focus" => Ok(PseudoClass::Focus),
            "enabled" => Ok(PseudoClass::Enabled),
            "disabled" => Ok(PseudoClass::Disabled),
            "checked" => Ok(PseudoClass::Checked),
            "link" | "any-link" => Ok(PseudoClass::Link),
            "visited" => Ok(PseudoClass::Visited),
            other if is_known_pseudo_class(other) => Ok(PseudoClass::Other(other.to_string())),
            _ => Err(cssparser::ParseError {
                kind: cssparser::ParseErrorKind::Custom(
                    SelectorParseErrorKind::UnsupportedPseudoClassOrElement(name),
                ),
                location: _location,
            }),
        }
    }

    fn parse_pseudo_element(
        &self,
        location: cssparser::SourceLocation,
        name: CowRcStr<'i>,
    ) -> Result<PseudoElement, cssparser::ParseError<'i, Self::Error>> {
        // The CSS2 pseudo-elements are valid in both one-colon (legacy) and
        // two-colon syntax; the crate routes both here. They never match a real
        // element (match_pseudo_element returns false), so a selector using them
        // parses successfully and simply selects nothing — which is what WPT's
        // "pseudo-element ... not matching" subtests expect (vs. throwing).
        match name.as_ref().to_ascii_lowercase().as_str() {
            "before" => Ok(PseudoElement::Before),
            "after" => Ok(PseudoElement::After),
            "first-line" => Ok(PseudoElement::FirstLine),
            "first-letter" => Ok(PseudoElement::FirstLetter),
            _ => Err(cssparser::ParseError {
                kind: cssparser::ParseErrorKind::Custom(
                    SelectorParseErrorKind::UnsupportedPseudoClassOrElement(name),
                ),
                location,
            }),
        }
    }

    fn parse_functional_pseudo_element<'t>(
        &self,
        name: CowRcStr<'i>,
        arguments: &mut cssparser::Parser<'i, 't>,
    ) -> Result<PseudoElement, cssparser::ParseError<'i, Self::Error>> {
        // ::slotted(...) parses-but-never-matches (see PseudoElement::Slotted). We
        // capture the argument's source text for round-tripping and consume the
        // remaining tokens so the functional block parses cleanly.
        if name.eq_ignore_ascii_case("slotted") {
            let start = arguments.position();
            while arguments.next().is_ok() {}
            let arg = arguments.slice_from(start).trim().to_string();
            return Ok(PseudoElement::Slotted(arg));
        }
        Err(arguments.new_custom_error(SelectorParseErrorKind::UnsupportedPseudoClassOrElement(name)))
    }

    fn parse_non_ts_functional_pseudo_class<'t>(
        &self,
        name: CowRcStr<'i>,
        parser: &mut cssparser::Parser<'i, 't>,
        _after_part: bool,
    ) -> Result<PseudoClass, cssparser::ParseError<'i, Self::Error>> {
        if name.eq_ignore_ascii_case("lang") {
            // :lang() takes a comma-separated list of language ranges (idents or
            // strings); the list must be non-empty.
            let mut langs = Vec::new();
            loop {
                langs.push(parser.expect_ident_or_string()?.as_ref().to_owned());
                if parser.try_parse(|p| p.expect_comma()).is_err() {
                    break;
                }
            }
            if !langs.is_empty() {
                return Ok(PseudoClass::Lang(langs));
            }
        }
        Err(parser.new_custom_error(SelectorParseErrorKind::UnsupportedPseudoClassOrElement(name)))
    }
}

#[derive(Clone, Copy)]
pub struct DomElement<'a> {
    pub tree: &'a DomTree,
    pub node_id: NodeId,
}

impl<'a> DomElement<'a> {
    pub fn new(tree: &'a DomTree, node_id: NodeId) -> Self {
        DomElement { tree, node_id }
    }
}

impl<'a> std::fmt::Debug for DomElement<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "DomElement({:?})", self.node_id)
    }
}

impl<'a> PartialEq for DomElement<'a> {
    fn eq(&self, other: &Self) -> bool {
        self.node_id == other.node_id
    }
}

impl<'a> Eq for DomElement<'a> {}

impl<'a> Element for DomElement<'a> {
    type Impl = ObscuraSelector;

    fn opaque(&self) -> OpaqueElement {
        // `self` is a throwaway stack temporary (DomElement is Copy and rebuilt
        // per node from a NodeId, since the tree stores clones). Using its
        // address would give an unstable, aliasing identity that corrupts the
        // selectors crate's NthIndexCache — breaking :nth-child(An+B) and the
        // *-of-type pseudo-classes. Derive a stable, unique, non-null identity
        // from the (stable) tree reference plus the node's arena index instead.
        let id = (self.tree as *const DomTree as usize)
            .wrapping_add((self.node_id.index() + 1).wrapping_mul(8));
        // SAFETY: () is zero-sized (align 1), so a reference to it only needs to
        // be non-null and aligned; `id` is non-null and we never dereference it
        // for data — selectors uses it solely for identity/equality.
        unsafe { OpaqueElement::new(&*(id as *const ())) }
    }

    fn parent_element(&self) -> Option<Self> {
        let node = self.tree.get_node(self.node_id)?;
        let parent_id = node.parent?;
        let parent = self.tree.get_node(parent_id)?;
        if parent.is_element() {
            Some(DomElement::new(self.tree, parent_id))
        } else {
            None
        }
    }

    fn parent_node_is_shadow_root(&self) -> bool {
        false
    }

    fn containing_shadow_host(&self) -> Option<Self> {
        None
    }

    fn pseudo_element_originating_element(&self) -> Option<Self> {
        None
    }

    fn is_pseudo_element(&self) -> bool {
        false
    }

    fn prev_sibling_element(&self) -> Option<Self> {
        let node = self.tree.get_node(self.node_id)?;
        let mut current = node.prev_sibling;
        while let Some(sibling_id) = current {
            let sibling = self.tree.get_node(sibling_id)?;
            if sibling.is_element() {
                return Some(DomElement::new(self.tree, sibling_id));
            }
            current = sibling.prev_sibling;
        }
        None
    }

    fn next_sibling_element(&self) -> Option<Self> {
        let node = self.tree.get_node(self.node_id)?;
        let mut current = node.next_sibling;
        while let Some(sibling_id) = current {
            let sibling = self.tree.get_node(sibling_id)?;
            if sibling.is_element() {
                return Some(DomElement::new(self.tree, sibling_id));
            }
            current = sibling.next_sibling;
        }
        None
    }

    fn first_element_child(&self) -> Option<Self> {
        let node = self.tree.get_node(self.node_id)?;
        let mut current = node.first_child;
        while let Some(child_id) = current {
            let child = self.tree.get_node(child_id)?;
            if child.is_element() {
                return Some(DomElement::new(self.tree, child_id));
            }
            current = child.next_sibling;
        }
        None
    }

    fn is_html_element_in_html_document(&self) -> bool {
        self.tree
            .with_node(self.node_id, |n| {
                n.as_element()
                    .map(|name| name.ns == ns!(html))
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn has_local_name(&self, local_name: &CssLocalName) -> bool {
        self.tree
            .with_node(self.node_id, |n| {
                n.as_element()
                    .map(|name| name.local == local_name.0)
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn has_namespace(&self, ns: &CssNamespace) -> bool {
        self.tree
            .with_node(self.node_id, |n| {
                n.as_element().map(|name| name.ns == ns.0).unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn is_same_type(&self, other: &Self) -> bool {
        let self_name = self
            .tree
            .with_node(self.node_id, |n| {
                n.as_element()
                    .map(|name| (name.local.clone(), name.ns.clone()))
            })
            .flatten();
        let other_name = self
            .tree
            .with_node(other.node_id, |n| {
                n.as_element()
                    .map(|name| (name.local.clone(), name.ns.clone()))
            })
            .flatten();
        match (self_name, other_name) {
            (Some((al, ans)), Some((bl, bns))) => al == bl && ans == bns,
            _ => false,
        }
    }

    fn attr_matches(
        &self,
        ns: &NamespaceConstraint<&CssNamespace>,
        local_name: &CssLocalName,
        operation: &AttrSelectorOperation<&CssString>,
    ) -> bool {
        self.tree
            .with_node(self.node_id, |node| {
                let attrs = match node.attrs() {
                    Some(a) => a,
                    None => return false,
                };
                attrs.iter().any(|attr| {
                    let ns_match = match ns {
                        NamespaceConstraint::Any => true,
                        NamespaceConstraint::Specific(expected_ns) => attr.name.ns == expected_ns.0,
                    };
                    if !ns_match || attr.name.local != local_name.0 {
                        return false;
                    }
                    operation.eval_str(&attr.value)
                })
            })
            .unwrap_or(false)
    }

    fn has_attr_in_no_namespace(&self, local_name: &CssLocalName) -> bool {
        self.tree
            .with_node(self.node_id, |node| {
                node.attrs()
                    .map(|attrs| {
                        attrs
                            .iter()
                            .any(|a| a.name.ns == html5ever::ns!() && a.name.local == local_name.0)
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn match_non_ts_pseudo_class(
        &self,
        pc: &PseudoClass,
        _context: &mut MatchingContext<'_, Self::Impl>,
    ) -> bool {
        match pc {
            // No pointer state in a headless tree.
            PseudoClass::Hover | PseudoClass::Active => false,
            // Phase 0b: live focus state.
            PseudoClass::Focus => self.tree.focused() == Some(self.node_id),
            // :disabled/:enabled from tag + attribute; :checked from live state.
            PseudoClass::Disabled | PseudoClass::Enabled | PseudoClass::Checked => self
                .tree
                .with_node(self.node_id, |n| {
                    let name = match n.as_element() {
                        Some(qn) => qn.local.as_ref(),
                        None => return false,
                    };
                    let form_disableable = matches!(
                        name,
                        "input" | "button" | "select" | "textarea" | "optgroup" | "option"
                            | "fieldset"
                    );
                    match pc {
                        PseudoClass::Disabled => {
                            form_disableable && n.get_attribute("disabled").is_some()
                        }
                        PseudoClass::Enabled => {
                            form_disableable && n.get_attribute("disabled").is_none()
                        }
                        PseudoClass::Checked => {
                            let is_check_radio = name == "input"
                                && n.get_attribute("type")
                                    .map(|t| {
                                        let t = t.to_ascii_lowercase();
                                        t == "checkbox" || t == "radio"
                                    })
                                    .unwrap_or(false);
                            // Phase 0b: live checked state overrides the attr default.
                            (is_check_radio && self.tree.checked(self.node_id))
                                || (name == "option" && n.get_attribute("selected").is_some())
                        }
                        _ => false,
                    }
                })
                .unwrap_or(false),
            // :link / :any-link match a/area/link with href; :visited never does.
            PseudoClass::Link => self.is_link(),
            PseudoClass::Visited => false,
            // :lang(...) matches against the element's language, which is the
            // value of the nearest `lang` attribute on the element or an ancestor.
            // A range matches if it equals the language or is a prefix of it
            // followed by "-" (case-insensitive); "*" matches any non-empty lang.
            PseudoClass::Lang(ranges) => {
                let mut cur = Some(self.node_id);
                let mut lang = String::new();
                while let Some(id) = cur {
                    match self
                        .tree
                        .with_node(id, |n| (n.get_attribute("lang").map(|s| s.to_string()), n.parent))
                    {
                        Some((Some(v), _)) => {
                            lang = v;
                            break;
                        }
                        Some((None, parent)) => cur = parent,
                        None => break,
                    }
                }
                let lang = lang.to_ascii_lowercase();
                ranges.iter().any(|r| {
                    let r = r.to_ascii_lowercase();
                    if r == "*" {
                        return !lang.is_empty();
                    }
                    !r.is_empty() && (lang == r || lang.starts_with(&(r + "-")))
                })
            }
            // Accepted-but-unimplemented standard pseudo-classes never match.
            PseudoClass::Other(_) => false,
        }
    }

    fn match_pseudo_element(
        &self,
        _pe: &PseudoElement,
        _context: &mut MatchingContext<'_, Self::Impl>,
    ) -> bool {
        false
    }

    fn apply_selector_flags(&self, _flags: ElementSelectorFlags) {}

    fn is_link(&self) -> bool {
        self.tree
            .with_node(self.node_id, |n| {
                n.as_element()
                    .map(|name| {
                        // :link / :visited apply only to a and area elements with an
                        // href — NOT <link> elements (WPT: "not matching link elements
                        // with href attributes").
                        matches!(name.local.as_ref(), "a" | "area")
                            && n.get_attribute("href").is_some()
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn is_html_slot_element(&self) -> bool {
        false
    }

    fn assigned_slot(&self) -> Option<Self> {
        None
    }

    fn has_id(&self, id: &CssString, case_sensitivity: CaseSensitivity) -> bool {
        self.tree
            .with_node(self.node_id, |n| {
                n.get_attribute("id")
                    .map(|value| case_sensitivity.eq(value.as_bytes(), id.0.as_bytes()))
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn has_class(&self, name: &CssString, case_sensitivity: CaseSensitivity) -> bool {
        self.tree
            .with_node(self.node_id, |n| {
                n.get_attribute("class")
                    .map(|class_attr| {
                        class_attr
                            .split_whitespace()
                            .any(|c| case_sensitivity.eq(c.as_bytes(), name.0.as_bytes()))
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn has_custom_state(&self, _name: &CssString) -> bool {
        false
    }

    fn imported_part(&self, _name: &CssString) -> Option<CssString> {
        None
    }

    fn is_part(&self, _name: &CssString) -> bool {
        false
    }

    fn is_empty(&self) -> bool {
        self.tree
            .with_node(self.node_id, |node| {
                let mut child = node.first_child;
                while let Some(child_id) = child {
                    if let Some(child_node) = self.tree.get_node(child_id) {
                        match &child_node.data {
                            NodeData::Element { .. } => return false,
                            NodeData::Text { contents } if !contents.is_empty() => return false,
                            _ => {}
                        }
                        child = child_node.next_sibling;
                    } else {
                        break;
                    }
                }
                true
            })
            .unwrap_or(true)
    }

    fn is_root(&self) -> bool {
        self.tree
            .with_node(self.node_id, |n| {
                n.parent
                    .map(|parent_id| {
                        self.tree
                            .with_node(parent_id, |p| p.is_document())
                            .unwrap_or(false)
                    })
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    }

    fn ignores_nth_child_selectors(&self) -> bool {
        false
    }

    fn add_element_unique_hashes(&self, _filter: &mut BloomFilter) -> bool {
        false
    }
}

pub fn parse_selector(selector: &str) -> Result<SelectorList<ObscuraSelector>, String> {
    let mut parser_input = cssparser::ParserInput::new(selector);
    let mut parser = cssparser::Parser::new(&mut parser_input);
    SelectorList::parse(&ObscuraSelectorParser, &mut parser, ParseRelative::No)
        .map_err(|e| format!("Failed to parse selector '{}': {:?}", selector, e))
}

impl DomTree {
    pub fn query_selector(&self, selector: &str) -> Result<Option<NodeId>, String> {
        self.query_selector_from(self.document(), selector)
    }

    pub fn query_selector_all(&self, selector: &str) -> Result<Vec<NodeId>, String> {
        self.query_selector_all_from(self.document(), selector)
    }

    pub fn query_selector_from(
        &self,
        root: NodeId,
        selector: &str,
    ) -> Result<Option<NodeId>, String> {
        let selector_list = parse_selector(selector)?;
        let mut caches = selectors::context::SelectorCaches::default();
        let mut context = MatchingContext::new(
            MatchingMode::Normal,
            None,
            &mut caches,
            QuirksMode::NoQuirks,
            NeedsSelectorFlags::No,
            MatchingForInvalidation::No,
        );

        for desc_id in self.descendants(root) {
            let is_element = self.with_node(desc_id, |n| n.is_element()).unwrap_or(false);
            if is_element {
                let element = DomElement::new(self, desc_id);
                if selectors::matching::matches_selector_list(
                    &selector_list,
                    &element,
                    &mut context,
                ) {
                    return Ok(Some(desc_id));
                }
            }
        }
        Ok(None)
    }

    pub fn query_selector_all_from(
        &self,
        root: NodeId,
        selector: &str,
    ) -> Result<Vec<NodeId>, String> {
        let selector_list = parse_selector(selector)?;
        let mut caches = selectors::context::SelectorCaches::default();
        let mut context = MatchingContext::new(
            MatchingMode::Normal,
            None,
            &mut caches,
            QuirksMode::NoQuirks,
            NeedsSelectorFlags::No,
            MatchingForInvalidation::No,
        );
        let mut results = Vec::new();

        for desc_id in self.descendants(root) {
            let is_element = self.with_node(desc_id, |n| n.is_element()).unwrap_or(false);
            if is_element {
                let element = DomElement::new(self, desc_id);
                if selectors::matching::matches_selector_list(
                    &selector_list,
                    &element,
                    &mut context,
                ) {
                    results.push(desc_id);
                }
            }
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use crate::tree::NodeId;
    use crate::tree_sink::parse_html;

    #[test]
    fn test_query_selector_tag() {
        let tree = parse_html("<html><body><h1>Title</h1><p>Text</p></body></html>");
        let result = tree.query_selector("h1").unwrap();
        assert!(result.is_some());
        let node = tree.get_node(result.unwrap()).unwrap();
        assert_eq!(node.as_element().unwrap().local.as_ref(), "h1");
    }

    #[test]
    fn test_query_selector_class() {
        let tree = parse_html(r#"<div class="foo bar">Content</div><div class="baz">Other</div>"#);
        let result = tree.query_selector(".foo").unwrap();
        assert!(result.is_some());
        let node = tree.get_node(result.unwrap()).unwrap();
        assert_eq!(node.get_attribute("class"), Some("foo bar"));
    }

    #[test]
    fn phase5_form_pseudo_classes_match_by_attribute() {
        let tree = parse_html(
            r#"<form>
                 <input id="c1" type="checkbox" checked>
                 <input id="c2" type="checkbox">
                 <input id="t" type="text" disabled>
                 <button id="b">ok</button>
               </form>"#,
        );
        let id_of = |nid: NodeId| tree.get_node(nid).unwrap().get_attribute("id").unwrap().to_string();

        // :checked — only the checked checkbox.
        let checked = tree.query_selector_all(":checked").unwrap();
        assert_eq!(checked.len(), 1);
        assert_eq!(id_of(checked[0]), "c1");

        // :disabled — the disabled text input (not the enabled ones).
        let disabled = tree.query_selector_all(":disabled").unwrap();
        assert_eq!(disabled.len(), 1);
        assert_eq!(id_of(disabled[0]), "t");

        // :enabled — the two checkboxes + the button (form elements w/o disabled).
        let enabled = tree.query_selector_all(":enabled").unwrap();
        let mut ids: Vec<String> = enabled.iter().map(|&n| id_of(n)).collect();
        ids.sort();
        assert_eq!(ids, vec!["b", "c1", "c2"]);

        // input:checked compound still works.
        let compound = tree.query_selector_all("input:checked").unwrap();
        assert_eq!(compound.len(), 1);
        assert_eq!(id_of(compound[0]), "c1");

        // :hover never matches in a headless tree.
        assert!(tree.query_selector_all(":hover").unwrap().is_empty());
    }

    #[test]
    fn structural_nth_and_of_type_pseudo_classes() {
        // Regression: a stable opaque() identity is required for the selectors
        // crate's NthIndexCache; without it An+B and *-of-type were broken.
        let tree = parse_html(
            r#"<ul><li id=a>1</li><li id=b>2</li><li id=c>3</li><li id=d>4</li><li id=e>5</li></ul>
               <p><em id=ea>a</em><b id=bb>b</b><em id=ec>c</em><i id=id>d</i><em id=ee>e</em></p>"#,
        );
        let ids = |sel: &str| {
            let mut v: Vec<String> = tree
                .query_selector_all(sel)
                .unwrap()
                .iter()
                .map(|&n| tree.get_node(n).unwrap().get_attribute("id").unwrap().to_string())
                .collect();
            v.sort();
            v
        };
        assert_eq!(ids("li:nth-child(2)"), vec!["b"]);
        assert_eq!(ids("li:nth-child(odd)"), vec!["a", "c", "e"]);
        assert_eq!(ids("li:nth-child(2n+1)"), vec!["a", "c", "e"]);
        assert_eq!(ids("li:nth-last-child(2)"), vec!["d"]);
        assert_eq!(ids("em:first-of-type"), vec!["ea"]);
        assert_eq!(ids("em:last-of-type"), vec!["ee"]);
        assert_eq!(ids("em:nth-of-type(2)"), vec!["ec"]);
        assert_eq!(ids("li:first-child"), vec!["a"]);
        assert_eq!(ids("li:last-child"), vec!["e"]);
    }

    #[test]
    fn link_pseudo_classes() {
        let tree = parse_html(
            r#"<a id=a href="x">link</a><a id=b>no href</a>
               <area id=c href="y"><link id=d href="z" rel=stylesheet><span id=e>x</span>"#,
        );
        let ids = |sel: &str| {
            let mut v: Vec<String> = tree
                .query_selector_all(sel)
                .unwrap()
                .iter()
                .filter_map(|&n| tree.get_node(n).unwrap().get_attribute("id").map(|s| s.to_string()))
                .collect();
            v.sort();
            v
        };
        // :link / :any-link match a and area WITH href — NOT <link> elements (d)
        // (WPT: "not matching link elements with href attributes"), nor the bare
        // href-less <a> (b) or <span> (e).
        assert_eq!(ids(":link"), vec!["a", "c"]);
        assert_eq!(ids(":any-link"), vec!["a", "c"]);
        assert_eq!(ids("a:link"), vec!["a"]);
        // :visited never matches (no history).
        assert!(ids(":visited").is_empty());
    }

    #[test]
    fn lang_pseudo_class_with_inheritance() {
        let tree = parse_html(
            r#"<div lang="en">
                 <p id=a>x</p>
                 <p id=b lang="fr">y</p>
                 <p id=c lang="en-US">z</p>
               </div>
               <p id=d>nolang</p>"#,
        );
        let ids = |sel: &str| {
            let mut v: Vec<String> = tree
                .query_selector_all(sel)
                .unwrap()
                .iter()
                .filter_map(|&n| tree.get_node(n).unwrap().get_attribute("id").map(|s| s.to_string()))
                .collect();
            v.sort();
            v
        };
        // a inherits en; c is en-US (prefix match); b is fr; d has no language.
        assert_eq!(ids(":lang(en)"), vec!["a", "c"]);
        assert_eq!(ids(":lang(fr)"), vec!["b"]);
        assert_eq!(ids(":lang(en-US)"), vec!["c"]);
        assert_eq!(ids(":lang(en, fr)"), vec!["a", "b", "c"]);
        // p:lang(en) excludes the no-language and fr paragraphs.
        assert_eq!(ids("p:lang(en)"), vec!["a", "c"]);
    }

    #[test]
    fn css2_pseudo_elements_parse_but_never_match() {
        // Regression: the four CSS2 pseudo-elements must PARSE (one- and
        // two-colon) and select nothing, rather than throwing a parse error.
        let tree = parse_html("<p>hi<span>x</span></p>");
        for sel in [
            "::before", "::after", "::first-line", "::first-letter",
            ":before", ":after", ":first-line", ":first-letter",
            "p::first-line", "span:first-letter",
        ] {
            let r = tree.query_selector_all(sel);
            assert!(r.is_ok(), "selector {sel:?} should parse, got {r:?}");
            assert!(r.unwrap().is_empty(), "selector {sel:?} should match nothing");
        }
        // An unknown pseudo-element still errors (so querySelector throws).
        assert!(tree.query_selector_all("::bogus-pe").is_err());
    }

    #[test]
    fn slotted_functional_pseudo_element_parses_but_never_matches() {
        // Regression: ::slotted(<compound>) must PARSE and select nothing rather
        // than throwing. cssparser auto-closes the unterminated-paren form at EOF,
        // so it parses too. An unknown functional pseudo-element still errors.
        let tree = parse_html("<p>hi<span>x</span></p>");
        for sel in ["::slotted(foo)", "::slotted(foo", "::slotted(*)", "span::slotted(a)"] {
            let r = tree.query_selector_all(sel);
            assert!(r.is_ok(), "selector {sel:?} should parse, got {r:?}");
            assert!(r.unwrap().is_empty(), "selector {sel:?} should match nothing");
        }
        assert!(tree.query_selector_all("::bogus-fn(x)").is_err());
    }

    #[test]
    fn phase0b_dynamic_checked_and_focus() {
        let tree = parse_html(
            r#"<input id="a" type="checkbox"><input id="b" type="checkbox"><input id="c" type="text">"#,
        );
        let a = tree.query_selector("#a").unwrap().unwrap();
        let c = tree.query_selector("#c").unwrap().unwrap();

        // No checked attribute and no state → :checked empty.
        assert!(tree.query_selector_all(":checked").unwrap().is_empty());
        // Live checked state (no attribute) → :checked matches it.
        tree.set_checked(a, true);
        assert_eq!(tree.query_selector_all(":checked").unwrap(), vec![a]);
        tree.set_checked(a, false);
        assert!(tree.query_selector_all(":checked").unwrap().is_empty());

        // Live focus → :focus matches the focused element.
        assert!(tree.query_selector_all(":focus").unwrap().is_empty());
        tree.set_focus(Some(c));
        assert_eq!(tree.query_selector_all(":focus").unwrap(), vec![c]);
        tree.set_focus(None);
        assert!(tree.query_selector_all(":focus").unwrap().is_empty());
    }

    #[test]
    fn test_query_selector_id() {
        let tree = parse_html(r#"<div id="main">Content</div>"#);
        let result = tree.query_selector("#main").unwrap();
        assert!(result.is_some());
    }

    #[test]
    fn test_query_selector_all() {
        let tree = parse_html("<ul><li>1</li><li>2</li><li>3</li></ul>");
        let results = tree.query_selector_all("li").unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_query_selector_descendant() {
        let tree = parse_html(r#"<div id="outer"><div id="inner"><span>Target</span></div></div>"#);
        let result = tree.query_selector("#outer span").unwrap();
        assert!(result.is_some());
        let node = tree.get_node(result.unwrap()).unwrap();
        assert_eq!(node.as_element().unwrap().local.as_ref(), "span");
    }

    #[test]
    fn test_query_selector_attribute() {
        let tree =
            parse_html(r#"<input type="text" name="user"><input type="password" name="pass">"#);
        let result = tree.query_selector(r#"input[type="password"]"#).unwrap();
        assert!(result.is_some());
        let node = tree.get_node(result.unwrap()).unwrap();
        assert_eq!(node.get_attribute("name"), Some("pass"));
    }

    #[test]
    fn test_query_selector_no_match() {
        let tree = parse_html("<div>Hello</div>");
        let result = tree.query_selector("span").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_query_selector_complex() {
        let tree = parse_html(
            r#"<div class="container">
                <ul class="list">
                    <li class="item active">First</li>
                    <li class="item">Second</li>
                    <li class="item active">Third</li>
                </ul>
            </div>"#,
        );
        let results = tree.query_selector_all(".list .item.active").unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_query_selector_all_from_scopes_to_subtree() {
        let tree = parse_html(
            r#"<div id="a"><span class="x">in a</span></div><div id="b"><span class="x">in b</span></div>"#,
        );
        let a = tree.get_element_by_id("a").expect("div#a");
        let b = tree.get_element_by_id("b").expect("div#b");

        // Document-rooted: sees both spans.
        assert_eq!(tree.query_selector_all(".x").unwrap().len(), 2);
        // Scoped to #a: only its descendant span.
        let in_a = tree.query_selector_all_from(a, ".x").unwrap();
        assert_eq!(in_a.len(), 1);
        let in_b = tree.query_selector_all_from(b, ".x").unwrap();
        assert_eq!(in_b.len(), 1);
        assert_ne!(in_a[0], in_b[0]);
    }

    #[test]
    fn test_query_selector_from_returns_first_in_subtree_only() {
        let tree =
            parse_html(r#"<section id="s"><p>first</p><p>second</p></section><p>outside</p>"#);
        let s = tree.get_element_by_id("s").expect("section#s");

        // Scoped to #s: skip the outside paragraph; return the first inside.
        let first_in_s = tree
            .query_selector_from(s, "p")
            .unwrap()
            .expect("a p inside");
        assert_eq!(tree.text_content(first_in_s), "first");
    }

    #[test]
    fn test_query_selector_from_excludes_self() {
        // The root element itself must not match its own scoped query, per
        // the spec: querySelector matches descendants only.
        let tree = parse_html(r#"<div id="root" class="x"><span>child</span></div>"#);
        let root = tree.get_element_by_id("root").expect("div#root");

        // Only descendants are candidates: `.x` on root finds nothing.
        assert!(tree.query_selector_from(root, ".x").unwrap().is_none());
        // `span` finds the child.
        assert!(tree.query_selector_from(root, "span").unwrap().is_some());
    }
}
