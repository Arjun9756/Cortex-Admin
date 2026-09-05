export interface ClientModel{
    org_name: string;
    contact_name: string | undefined;
    email: string;
    phone?: string;
}


let data:ClientModel = {
    contact_name:undefined,
    org_name:"Cortex",
    email:"arjun@cortex.com",
    phone:"45445"
}

function solve(){

    let entries = Object.fromEntries(Object.entries(data).filter(([key , value])=>{
        return value !== undefined
    }))

    console.log(Object.entries(data))

    let cleanData = Object.keys(entries)
    if(cleanData.length <= 0){
        throw new Error("No Fields Provided To Update")
    }

    let clause = cleanData.map((field)=>{
        return `${field}=?`
    }).join(',')

    let values = [...Object.values(entries)]
    let query = `UPDATE clients SET ${clause}`

    console.log(query , values)
}

solve()