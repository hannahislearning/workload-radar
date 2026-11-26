import { useLayoutEffect, useRef, useState } from 'react'
import { CharacterAvatar } from './OfficeFloor.jsx'

export function AccountSwitcher({ users, current, onChange }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  return <div className="office-account" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) close()
  }}>
    <button type="button" className="account-trigger" ref={trigger} aria-label={'Switch account, ' + current.name}
      aria-expanded={open} aria-controls="demo-accounts" onClick={() => setOpen(value => !value)}>
      <CharacterAvatar userId={current.id}/>
      <span><strong>{current.name}</strong><small>{current.role}</small></span>
      <i className="account-chevron" aria-hidden="true"/>
    </button>
    {open && <div id="demo-accounts" className="account-menu" role="group" aria-label="Demo accounts">
      {users.map(user => <button type="button" key={user.id} aria-current={user.id === current.id ? 'true' : undefined}
        onClick={() => { onChange(user.id); close() }}>
        <CharacterAvatar userId={user.id}/>
        <span><strong>{user.name}</strong><small>{user.role}</small></span>
        {user.id === current.id && <span className="account-check" aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>
}

export function OfficeTabs({ tabs, active, onChange, count }) {
  const rail = useRef(null)
  useLayoutEffect(() => {
    const container = rail.current
    const marker = container.firstElementChild
    const sync = () => {
      const current = container.querySelector('[aria-pressed="true"]')
      if (!current) return
      marker.style.transform = `translate(${current.offsetLeft}px, ${current.offsetTop}px)`
      marker.style.width = current.offsetWidth + 'px'
      marker.style.height = current.offsetHeight + 'px'
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(container)
    for (const button of container.querySelectorAll('button')) observer.observe(button)
    return () => observer.disconnect()
  }, [active, count])

  return <div className="side-tabs" ref={rail} role="group" aria-label="Right panel">
    <span className="side-tab-marker" aria-hidden="true"/>
    {tabs.map(([key,label]) => <button type="button" key={key} aria-pressed={key === active} onClick={() => onChange(key)}>
      {label}{key === 'needs' && count > 0 && <b className="inbox-count" aria-label={count + ' pending'}>{count}</b>}
    </button>)}
  </div>
}
