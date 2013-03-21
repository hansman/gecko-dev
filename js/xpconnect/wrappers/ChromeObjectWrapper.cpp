#include "ChromeObjectWrapper.h"

namespace xpc {

// When creating wrappers for chrome objects in content, we detect if the
// prototype of the wrapped chrome object is a prototype for a standard class
// (like Array.prototype). If it is, we use the corresponding standard prototype
// from the wrapper's scope, rather than the wrapped standard prototype
// from the wrappee's scope.
//
// One of the reasons for doing this is to allow standard operations like
// chromeArray.forEach(..) to Just Work without explicitly listing them in
// __exposedProps__. Since proxies don't automatically inherit behavior from
// their prototype, we have to instrument the traps to do this manually.
ChromeObjectWrapper ChromeObjectWrapper::singleton;

using js::assertEnteredPolicy;

static bool
AllowedByBase(JSContext *cx, JSObject *wrapper, jsid id, js::Wrapper::Action act)
{
    MOZ_ASSERT(js::Wrapper::wrapperHandler(wrapper) ==
               &ChromeObjectWrapper::singleton);
    bool bp;
    ChromeObjectWrapper *handler = &ChromeObjectWrapper::singleton;
    return handler->ChromeObjectWrapperBase::enter(cx, wrapper, id, act, &bp);
}

static bool
PropIsFromStandardPrototype(JSContext *cx, JSPropertyDescriptor *desc)
{
    MOZ_ASSERT(desc->obj);
    JSObject *unwrapped = js::UnwrapObject(desc->obj);
    JSAutoCompartment ac(cx, unwrapped);
    return JS_IdentifyClassPrototype(cx, unwrapped) != JSProto_Null;
}

// Note that we're past the policy enforcement stage, here, so we can query
// ChromeObjectWrapperBase and get an unfiltered view of the underlying object.
// This lets us determine whether the property we would have found (given a
// transparent wrapper) would have come off a standard prototype.
static bool
PropIsFromStandardPrototype(JSContext *cx, JSObject *wrapperArg, jsid idArg)
{
    JS::Rooted<JSObject *> wrapper(cx, wrapperArg);
    JS::Rooted<jsid> id(cx, idArg);

    MOZ_ASSERT(js::Wrapper::wrapperHandler(wrapper) ==
               &ChromeObjectWrapper::singleton);
    JSPropertyDescriptor desc;
    ChromeObjectWrapper *handler = &ChromeObjectWrapper::singleton;
    if (!handler->ChromeObjectWrapperBase::getPropertyDescriptor(cx, wrapper, id,
                                                                 &desc, 0) ||
        !desc.obj)
    {
        return false;
    }
    return PropIsFromStandardPrototype(cx, &desc);
}

bool
ChromeObjectWrapper::getPropertyDescriptor(JSContext *cx,
                                           JS::Handle<JSObject *> wrapper,
                                           JS::Handle<jsid> id,
                                           js::PropertyDescriptor *desc,
                                           unsigned flags)
{
    assertEnteredPolicy(cx, wrapper, id);
    // First, try a lookup on the base wrapper if permitted.
    desc->obj = NULL;
    if (AllowedByBase(cx, wrapper, id, Wrapper::GET) &&
        !ChromeObjectWrapperBase::getPropertyDescriptor(cx, wrapper, id,
                                                        desc, flags)) {
        return false;
    }

    // If the property is something that can be found on a standard prototype,
    // prefer the one we'll get via the prototype chain in the content
    // compartment.
    if (desc->obj && PropIsFromStandardPrototype(cx, desc))
        desc->obj = NULL;

    // If we found something or have no proto, we're done.
    JSObject *wrapperProto;
    if (!JS_GetPrototype(cx, wrapper, &wrapperProto))
      return false;
    if (desc->obj || !wrapperProto)
        return true;

    // If not, try doing the lookup on the prototype.
    MOZ_ASSERT(js::IsObjectInContextCompartment(wrapper, cx));
    return JS_GetPropertyDescriptorById(cx, wrapperProto, id, 0, desc);
}

bool
ChromeObjectWrapper::has(JSContext *cx, JSObject *wrapper, jsid id, bool *bp)
{
    assertEnteredPolicy(cx, wrapper, id);
    // Try the lookup on the base wrapper if permitted.
    if (AllowedByBase(cx, wrapper, id, js::Wrapper::GET) &&
        !ChromeObjectWrapperBase::has(cx, wrapper, id, bp))
    {
        return false;
    }

    // If we found something or have no prototype, we're done.
    JSObject *wrapperProto;
    if (!JS_GetPrototype(cx, wrapper, &wrapperProto))
        return false;
    if (*bp || !wrapperProto)
        return true;

    // Try the prototype if that failed.
    MOZ_ASSERT(js::IsObjectInContextCompartment(wrapper, cx));
    JSPropertyDescriptor desc;
    if (!JS_GetPropertyDescriptorById(cx, wrapperProto, id, 0, &desc))
        return false;
    *bp = !!desc.obj;
    return true;
}

bool
ChromeObjectWrapper::get(JSContext *cx, JSObject *wrapper, JSObject *receiver,
                         jsid id, js::Value *vp)
{
    assertEnteredPolicy(cx, wrapper, id);
    vp->setUndefined();
    JSPropertyDescriptor desc;
    // Only call through to the get trap on the underlying object if we're
    // allowed to see the property, and if what we'll find is not on a standard
    // prototype.
    if (AllowedByBase(cx, wrapper, id, js::Wrapper::GET) &&
        !PropIsFromStandardPrototype(cx, wrapper, id))
    {
        // Call the get trap.
        if (!ChromeObjectWrapperBase::get(cx, wrapper, receiver, id, vp))
            return false;
        // If we found something, we're done.
        if (!vp->isUndefined())
            return true;
    }

    // If we have no proto, we're done.
    JSObject *wrapperProto;
    if (!JS_GetPrototype(cx, wrapper, &wrapperProto))
        return false;
    if (!wrapperProto)
        return true;

    // Try the prototype.
    MOZ_ASSERT(js::IsObjectInContextCompartment(wrapper, cx));
    return js::GetGeneric(cx, wrapperProto, receiver, id, vp);
}

// SecurityWrapper categorically returns false for objectClassIs, but the
// contacts API depends on Array.isArray returning true for COW-implemented
// contacts. This isn't really ideal, but make it work for now.
bool
ChromeObjectWrapper::objectClassIs(JSObject *obj, js::ESClassValue classValue,
                                   JSContext *cx)
{
  return CrossCompartmentWrapper::objectClassIs(obj, classValue, cx);
}

// This mechanism isn't ideal because we end up calling enter() on the base class
// twice (once during enter() here and once during the trap itself), and policy
// enforcement or COWs isn't cheap. But it results in the cleanest code, and this
// whole proto remapping thing for COWs is going to be phased out anyway.
bool
ChromeObjectWrapper::enter(JSContext *cx, JSObject *wrapper, jsid id,
                           js::Wrapper::Action act, bool *bp)
{
    if (AllowedByBase(cx, wrapper, id, act))
        return true;
    // COWs fail silently for GETs, and that also happens to be the only case
    // where we might want to redirect the lookup to the home prototype chain.
    *bp = (act == Wrapper::GET);
    if (!*bp || id == JSID_VOID)
        return false;

    // Note that PropIsFromStandardPrototype needs to invoke getPropertyDescriptor
    // before we've fully entered the policy. Waive our policy.
    JS::RootedObject rootedWrapper(cx, wrapper);
    JS::RootedId rootedId(cx, id);
    js::AutoWaivePolicy policy(cx, rootedWrapper, rootedId);
    return PropIsFromStandardPrototype(cx, wrapper, id);
}

}
