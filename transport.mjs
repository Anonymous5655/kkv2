const API='/api/plugins/nai-connection-hub';
const generationPaths=new Map([
    ['/api/novelai/generate-image','/generate'],
    ['/api/plugins/autopic/generate-image','/generate'],
    ['/api/plugins/autopic/generate-direct','/generate-direct'],
]);
const oldBridges=['sharednai-bridge','sakura-nai-bridge'].flatMap(id=>['generate','generate-direct','direct-models'].map(route=>`/api/plugins/${id}/${route}`));
export function installTransport(host,enabled,conflict,onComplete=()=>{}) {
    const previous=host.fetch.bind(host);
    host.fetch=async(input,init)=>{
        const req=input instanceof Request?input:null;
        const url=new URL(req?req.url:String(input),host.location.href);
        const method=(init?.method??req?.method??'GET').toUpperCase();
        if(!enabled()||url.origin!==host.location.origin)return previous(input,init);
        const models=url.pathname==='/api/plugins/autopic/direct-models'&&method==='GET';
        const generation=generationPaths.has(url.pathname)&&method==='POST';
        if(conflict()&&(models||generation||oldBridges.includes(url.pathname)))return Response.json({message:'개별 SharedNAI·Sakura 연결을 끄고 통합 연결을 사용하세요.'},{status:409});
        if(!models&&!generation)return previous(input,init);
        try {
            const headers=new Headers(init?.headers??req?.headers);headers.delete('Authorization');headers.set('Content-Type','application/json');
            const response=await previous(API+(models?'/direct-models':generationPaths.get(url.pathname)),{
                method,headers,credentials:'same-origin',signal:init?.signal??req?.signal,
                ...(generation?{body:init?.body??await req?.clone().text()}:{}),
            });
            try {onComplete(response.status,generation);}catch{/* UI must not affect a billable request. */}
            return response;
        }catch{return Response.json({message:'생성 연결이 끊겼습니다. 사이트의 결과를 확인한 뒤 재시도하세요.'},{status:502});}
    };
}
