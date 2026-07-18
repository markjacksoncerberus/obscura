#[macro_use]
extern crate html5ever;

pub mod selector;
pub mod serialize;
pub mod tree;
pub mod tree_sink;

pub use tree::{Attribute, DomTree, MutationKind, MutationRecord, Node, NodeData, NodeId};
pub use tree_sink::{parse_fragment, parse_fragment_ctx, parse_html};
