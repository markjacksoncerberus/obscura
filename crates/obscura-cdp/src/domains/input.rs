use serde_json::{json, Value};

use crate::dispatch::CdpContext;

fn button_code(button: &str) -> i64 {
    match button {
        "left" => 0,
        "middle" => 1,
        "right" => 2,
        "back" => 3,
        "forward" => 4,
        _ => -1,
    }
}

pub async fn handle(
    method: &str,
    params: &Value,
    ctx: &mut CdpContext,
    session_id: &Option<String>,
) -> Result<Value, String> {
    match method {
        "dispatchMouseEvent" => {
            let event_type = params.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let x = params.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = params.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let button = params.get("button").and_then(|v| v.as_str()).unwrap_or("none");
            let click_count = params
                .get("clickCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(1);
            let buttons = params
                .get("buttons")
                .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|u| u as i64)));
            let modifiers = params.get("modifiers").and_then(|v| v.as_i64()).unwrap_or(0);
            let delta_x = params.get("deltaX").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let delta_y = params.get("deltaY").and_then(|v| v.as_f64()).unwrap_or(0.0);

            if let Some(page) = ctx.get_session_page_mut(session_id) {
                let payload = json!({
                    "type": event_type,
                    "x": x,
                    "y": y,
                    "button": button,
                    "buttonCode": button_code(button),
                    "clickCount": click_count,
                    "buttons": buttons.unwrap_or(-1),
                    "modifiers": modifiers,
                    "deltaX": delta_x,
                    "deltaY": delta_y,
                });
                let mut code = r#"
                    (function(evt) {
                        const doc = globalThis.document;
                        if (!doc) return;
                        const state = globalThis.__obscura_mouse_state || (globalThis.__obscura_mouse_state = {
                            pressed: Object.create(null),
                            hoverTarget: null,
                            lastX: 0,
                            lastY: 0
                        });

                        const dragThreshold = 1;

                        function hasModifier(mask) {
                            return (evt.modifiers & mask) !== 0;
                        }

                        function pickTarget() {
                            let target = null;
                            if (doc.elementFromPoint) {
                                target = doc.elementFromPoint(evt.x, evt.y);
                            }
                            if (!target) {
                                target = globalThis.__obscura_click_target || doc.activeElement || doc.body || doc.documentElement;
                            }
                            return target || null;
                        }

                        function activeButtonsMask(defaultMask) {
                            if (typeof evt.buttons === 'number' && evt.buttons >= 0) {
                                return evt.buttons;
                            }
                            if (typeof defaultMask === 'number') {
                                return defaultMask;
                            }
                            let mask = 0;
                            for (const key in state.pressed) {
                                const code = Number(key);
                                if (code === 0) mask |= 1;
                                else if (code === 1) mask |= 4;
                                else if (code === 2) mask |= 2;
                                else if (code === 3) mask |= 8;
                                else if (code === 4) mask |= 16;
                            }
                            return mask;
                        }

                        function assignMouseFields(event, init) {
                            event.button = init.button;
                            event.buttons = init.buttons;
                            event.clientX = init.clientX;
                            event.clientY = init.clientY;
                            event.screenX = init.screenX;
                            event.screenY = init.screenY;
                            event.ctrlKey = init.ctrlKey;
                            event.shiftKey = init.shiftKey;
                            event.altKey = init.altKey;
                            event.metaKey = init.metaKey;
                            event.detail = init.detail;
                            if (init.relatedTarget !== undefined) {
                                event.relatedTarget = init.relatedTarget;
                            }
                            return event;
                        }

                        function dispatchMouseEvent(type, target, buttonCode, buttonsMask, detail, relatedTarget) {
                            if (!target) return null;
                            const init = {
                                bubbles: true,
                                cancelable: true,
                                composed: true,
                                clientX: evt.x,
                                clientY: evt.y,
                                screenX: evt.x,
                                screenY: evt.y,
                                button: buttonCode,
                                buttons: buttonsMask,
                                detail: detail || 0,
                                ctrlKey: hasModifier(2),
                                shiftKey: hasModifier(8),
                                altKey: hasModifier(1),
                                metaKey: hasModifier(4),
                                relatedTarget: relatedTarget
                            };
                            const mouseEvent = assignMouseFields(new MouseEvent(type, init), init);
                            target.dispatchEvent(mouseEvent);
                            return mouseEvent;
                        }

                        function dispatchPlainEvent(type, target) {
                            if (!target) return null;
                            const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
                            target.dispatchEvent(event);
                            return event;
                        }

                        function dispatchWheelEvent(target) {
                            if (!target) return null;
                            const init = {
                                bubbles: true,
                                cancelable: true,
                                composed: true,
                                clientX: evt.x,
                                clientY: evt.y,
                                screenX: evt.x,
                                screenY: evt.y,
                                deltaX: evt.deltaX || 0,
                                deltaY: evt.deltaY || 0,
                                deltaZ: 0,
                                deltaMode: 0,
                                ctrlKey: hasModifier(2),
                                shiftKey: hasModifier(8),
                                altKey: hasModifier(1),
                                metaKey: hasModifier(4)
                            };
                            const wheel = new WheelEvent("wheel", init);
                            wheel.deltaX = init.deltaX;
                            wheel.deltaY = init.deltaY;
                            wheel.deltaZ = init.deltaZ;
                            wheel.deltaMode = init.deltaMode;
                            wheel.clientX = init.clientX;
                            wheel.clientY = init.clientY;
                            wheel.ctrlKey = init.ctrlKey;
                            wheel.shiftKey = init.shiftKey;
                            wheel.altKey = init.altKey;
                            wheel.metaKey = init.metaKey;
                            target.dispatchEvent(wheel);
                            return wheel;
                        }

                        const target = pickTarget();
                        const buttonCode = typeof evt.buttonCode === 'number' ? evt.buttonCode : -1;
                        const pressedKey = String(buttonCode);

                        if (evt.type === "mousePressed") {
                            if (!target) return;
                            globalThis.__obscura_click_target = target;
                            const buttonsMask = activeButtonsMask(buttonCode >= 0 ? (1 << buttonCode) : 0);
                            dispatchMouseEvent("mousedown", target, buttonCode, buttonsMask, evt.clickCount || 1);
                            if (buttonCode >= 0) {
                                state.pressed[pressedKey] = {
                                    target: target,
                                    startX: evt.x,
                                    startY: evt.y,
                                    moved: false,
                                    dragging: false
                                };
                            }
                            state.hoverTarget = target;
                            state.lastX = evt.x;
                            state.lastY = evt.y;
                            return;
                        }

                        if (evt.type === "mouseMoved") {
                            if (!target) return;
                            const prevTarget = state.hoverTarget;
                            const buttonsMask = activeButtonsMask();
                            if (prevTarget && prevTarget !== target) {
                                dispatchMouseEvent("mouseout", prevTarget, -1, buttonsMask, 0, target);
                                dispatchMouseEvent("mouseleave", prevTarget, -1, buttonsMask, 0, target);
                                dispatchMouseEvent("mouseover", target, -1, buttonsMask, 0, prevTarget);
                                dispatchMouseEvent("mouseenter", target, -1, buttonsMask, 0, prevTarget);
                            } else if (!prevTarget || prevTarget !== target) {
                                dispatchMouseEvent("mouseover", target, -1, buttonsMask, 0, null);
                                dispatchMouseEvent("mouseenter", target, -1, buttonsMask, 0, null);
                            }
                            dispatchMouseEvent("mousemove", target, buttonCode, buttonsMask, 0);
                            for (const key in state.pressed) {
                                const pressed = state.pressed[key];
                                if (!pressed) continue;
                                const moved = Math.abs(evt.x - pressed.startX) > dragThreshold
                                    || Math.abs(evt.y - pressed.startY) > dragThreshold;
                                if (moved) {
                                    pressed.moved = true;
                                }
                                if (pressed.moved && !pressed.dragging) {
                                    pressed.dragging = true;
                                    dispatchPlainEvent("dragstart", pressed.target);
                                }
                                if (pressed.dragging) {
                                    dispatchPlainEvent("drag", pressed.target);
                                    dispatchPlainEvent("dragover", target);
                                }
                            }
                            state.hoverTarget = target;
                            state.lastX = evt.x;
                            state.lastY = evt.y;
                            return;
                        }

                        if (evt.type === "mouseReleased") {
                            if (!target) return;
                            const buttonsMask = activeButtonsMask(0);
                            dispatchMouseEvent("mouseup", target, buttonCode, buttonsMask, evt.clickCount || 1);
                            const pressed = state.pressed[pressedKey];
                            if (pressed) {
                                if (pressed.dragging) {
                                    dispatchPlainEvent("drop", target);
                                    dispatchPlainEvent("dragend", pressed.target);
                                }
                                if (!pressed.moved) {
                                    if (buttonCode === 2) {
                                        dispatchMouseEvent("contextmenu", target, buttonCode, buttonsMask, evt.clickCount || 1);
                                    } else if (buttonCode === 1) {
                                        dispatchMouseEvent("auxclick", target, buttonCode, buttonsMask, evt.clickCount || 1);
                                    } else if (buttonCode === 0) {
                                        const click = dispatchMouseEvent("click", target, buttonCode, buttonsMask, evt.clickCount || 1);
                                        if ((evt.clickCount || 1) > 1) {
                                            dispatchMouseEvent("dblclick", target, buttonCode, buttonsMask, evt.clickCount || 1);
                                        }
                                        if (click && !click.defaultPrevented) {
                                            let link = target.closest ? target.closest('a[href]') : null;
                                            if (!link && target.tagName === 'A' && target.getAttribute('href')) {
                                                link = target;
                                            }
                                            if (link) {
                                                const href = link.getAttribute('href');
                                                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                                                    location.assign(href);
                                                }
                                            }
                                        }
                                    } else {
                                        dispatchMouseEvent("auxclick", target, buttonCode, buttonsMask, evt.clickCount || 1);
                                    }
                                }
                                delete state.pressed[pressedKey];
                            }
                            state.hoverTarget = target;
                            state.lastX = evt.x;
                            state.lastY = evt.y;
                            return;
                        }

                        if (evt.type === "mouseWheel") {
                            if (!target) return;
                            dispatchWheelEvent(target);
                            state.hoverTarget = target;
                            state.lastX = evt.x;
                            state.lastY = evt.y;
                        }
                    })(__PAYLOAD__);
                "#
                .to_string();
                let payload_json =
                    serde_json::to_string(&payload).map_err(|e| format!("Invalid mouse payload: {e}"))?;
                code = code.replace("__PAYLOAD__", &payload_json);
                page.evaluate(&code);
                if event_type == "mousePressed" || event_type == "mouseReleased" {
                    page.process_pending_navigation().await.map_err(|e| e.to_string())?;
                }
            }

            Ok(json!({}))
        }
        "dispatchKeyEvent" => {
            let event_type = params.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let key = params.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let code = params.get("code").and_then(|v| v.as_str()).unwrap_or("");
            let text = params.get("text").and_then(|v| v.as_str()).unwrap_or("");

            if let Some(page) = ctx.get_session_page_mut(session_id) {
                match event_type {
                    "keyDown" | "rawKeyDown" => {
                        let js = format!(
                            "(function() {{\
                                var target = document.activeElement || document.body;\
                                var evt = new KeyboardEvent('keydown', {{bubbles:true,cancelable:true,key:'{key}',code:'{code}'}});\
                                target.dispatchEvent(evt);\
                            }})()",
                            key = key.replace('\'', "\\'"),
                            code = code.replace('\'', "\\'"),
                        );
                        page.evaluate(&js);

                        if !text.is_empty() && text != "\r" && text != "\n" {
                            let js = format!(
                                "(function() {{\
                                    var target = document.activeElement;\
                                    if (target && (target.localName === 'input' || target.localName === 'textarea')) {{\
                                        target.value = (target.value || '') + '{text}';\
                                        target.dispatchEvent(new Event('input', {{bubbles:true}}));\
                                    }}\
                                }})()",
                                text = text.replace('\'', "\\'").replace('\\', "\\\\"),
                            );
                            page.evaluate(&js);
                        }

                        if key == "Enter" {
                            let js = "(function() {\
                                var target = document.activeElement;\
                                if (target) {\
                                    target.dispatchEvent(new KeyboardEvent('keypress', {bubbles:true,key:'Enter',code:'Enter'}));\
                                    var form = target.form || target.closest && target.closest('form');\
                                    if (form && typeof form.submit === 'function') form.submit();\
                                }\
                            })()";
                            page.evaluate(js);
                        }

                        if key == "Backspace" {
                            let js = "(function() {\
                                var target = document.activeElement;\
                                if (target && (target.localName === 'input' || target.localName === 'textarea')) {\
                                    target.value = target.value.slice(0, -1);\
                                    target.dispatchEvent(new Event('input', {bubbles:true}));\
                                }\
                            })()";
                            page.evaluate(js);
                        }
                    }
                    "keyUp" => {
                        let js = format!(
                            "(function() {{\
                                var target = document.activeElement || document.body;\
                                var evt = new KeyboardEvent('keyup', {{bubbles:true,key:'{key}',code:'{code}'}});\
                                target.dispatchEvent(evt);\
                            }})()",
                            key = key.replace('\'', "\\'"),
                            code = code.replace('\'', "\\'"),
                        );
                        page.evaluate(&js);
                    }
                    "char" => {
                        if !text.is_empty() {
                            let js = format!(
                                "(function() {{\
                                    var target = document.activeElement;\
                                    if (target && (target.localName === 'input' || target.localName === 'textarea')) {{\
                                        target.value = (target.value || '') + '{text}';\
                                        target.dispatchEvent(new Event('input', {{bubbles:true}}));\
                                    }}\
                                }})()",
                                text = text.replace('\'', "\\'").replace('\\', "\\\\"),
                            );
                            page.evaluate(&js);
                        }
                    }
                    _ => {}
                }
            }

            Ok(json!({}))
        }
        "dispatchTouchEvent" => Ok(json!({})),
        "setIgnoreInputEvents" => Ok(json!({})),
        _ => Err(format!("Unknown Input method: {}", method)),
    }
}
