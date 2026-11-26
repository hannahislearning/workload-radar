export default function Toast({ onUndo }) {
  return <div className="banner ok" role="status">Task marked done. <button className="btn tiny" onClick={onUndo}>Undo</button></div>
}
