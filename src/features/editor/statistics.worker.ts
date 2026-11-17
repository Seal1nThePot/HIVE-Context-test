import {textStatistics} from './statusModel';

self.onmessage=(event:MessageEvent<{id:number;texts:string[]}>)=>{
  const {id,texts}=event.data;
  try{const value={characters:0,pureCount:0,paragraphs:0};for(const text of texts){const part=textStatistics(text);value.characters+=part.characters;value.pureCount+=part.pureCount;value.paragraphs+=part.paragraphs;}self.postMessage({id,value});}
  catch{self.postMessage({id,error:'字数统计暂时不可用'});}
};
