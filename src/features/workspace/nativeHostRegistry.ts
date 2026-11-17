export type NativeHost<T>={id:string;members:string[];active:string;group:boolean;resource:T};

/** A group owns a host identity independently of every movable panel member. */
export class NativeHostRegistry<T> {
  private hosts=new Map<string,NativeHost<T>>();
  private owners=new Map<string,string>();
  values(){return [...this.hosts.values()];}
  get(id:string){return this.hosts.get(id)||this.hosts.get(this.owners.get(id)||'');}
  owner(id:string){return this.get(id)?.id||id;}
  create(id:string,members:string[],active:string,resource:T,group=false){
    if(!members.length||new Set(members).size!==members.length||!members.includes(active)||this.hosts.has(id)||members.some(member=>this.owners.has(member)))throw new Error('Native host membership conflict');
    const host={id,members:[...members],active,resource,group};this.hosts.set(id,host);members.forEach(member=>this.owners.set(member,id));return host;
  }
  select(id:string,member:string){const host=this.get(id);if(!host?.members.includes(member))return false;host.active=member;return true;}
  remove(id:string){const host=this.get(id);if(!host)return;this.hosts.delete(host.id);host.members.forEach(member=>this.owners.delete(member));return host;}
  extract(member:string){
    const host=this.get(member);if(!host||!host.members.includes(member)||host.members.length<2)return;
    const index=host.members.indexOf(member),active=host.active,order=[...host.members];
    this.owners.delete(member);host.members=host.members.filter(id=>id!==member);if(host.active===member)host.active=host.members[Math.min(index,host.members.length-1)];
    return {host,index,active,restore:()=>{
      if(this.hosts.get(host.id)!==host||this.owners.has(member))return false;
      host.members=[...order.filter(id=>id===member||host.members.includes(id)),...host.members.filter(id=>!order.includes(id))];
      if(host.members.includes(active))host.active=active;this.owners.set(member,host.id);return true;
    }};
  }
  removeMember(member:string){const host=this.get(member);if(!host||!host.members.includes(member))return;if(host.members.length===1)return this.remove(host.id);this.extract(member);return host;}
}
