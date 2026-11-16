import type {ReactNode} from 'react';
export default function SettingRow({title,description,children}:{title:ReactNode;description?:ReactNode;children:ReactNode}){
  return <div className="setting-row"><div className="setting-row-info"><div className="setting-row-title">{title}</div>{description&&<p>{description}</p>}</div><div className="setting-row-control">{children}</div></div>;
}
