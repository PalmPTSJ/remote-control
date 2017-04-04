/* type is not needed because server is not strict with the rule */
var commandList = new Array();
var conn = null;
function sendCommand(packetStruct,_cb,_arg)
{
	var commandStruct = {
		cb:_cb ,
		arg:_arg ,
		id:packetStruct.id
	};
	commandList.push(commandStruct);
	if(conn != null) conn.send(wsEncodeMsgFromPacket(packetStruct));
}
function runCommand(data)
{
	// if data.id in commandList
	for(var i = 0;i < commandList.length;i++) {
		if(commandList[i].id == data.id) {
			// data is the response
			commandList[i].cb(data.data,commandList[i].arg);
			commandList.splice(i,1);
			return true;
		}
	}
	if(data.op == "SOCKETSTAT") {
		var args = data.data.split('|');
	}
	return false;
}
function socket_build(fnc)
{
	var toRet = {
		status:"NONE",
		recvBuffer:[],
		sendBuffer:[],
		cb:fnc,
		id:-1
	}
	return toRet;
}
function socket_send(sock,data)
{
	sock.sendBuffer.push(data);
}
function socket_create(sock)
{
	sendCommand(buildPacket("SOCKET","CREATE",'1'),socket_create_cb,sock);
}
function socket_connect(sock,host,port,cb)
{
	sendCommand(buildPacket("SOCKET","CONNECT|"+sock.id+"|"+host+"|"+port,'1'),cb,sock);
}
function socket_create_cb(ret,sock)
{
	if(ret.length < 3 || ret[0] != 'O') {
		sock.status = "ERROR"; // Error
		return;
	}
	var id = parseInt(ret.substring(2));
	sock.id = id;
	sock.status = "READY";
}
var idCount = 1;
function buildPacket(opcode,_data,encodingType)
{
	var toRet = {
		op:opcode ,
		data:_data ,
		enc:encodingType ,
		id:idCount
	}
	idCount++;
	if(idCount>999999999) idCount = 1;
	return toRet;
}

function wsEncodeMsg(opcode,data,encodingType) // encoding to packet msg
{
	var toRet = (encodingType+opcode+'|'+idCount+'|'+data);
	idCount++;
	if(idCount>999999999) idCount = 1;
	return toRet;
}
function wsEncodeMsgFromPacket(packet)
{
	var toRet = packet.enc+packet.op+'|'+packet.id+'|'+packet.data;
	return toRet;
}
function wsEncodeBlobMsg(opcode,data,encodingType)
{
	
}
function translate_ws_to_s2(ws) // for encoding '2' data to be send ([UNI]abcd -> [2 UNICODE BYTE]_a_b_c_d)
{
	var encoded = new String();
    for(var i = 0;i < ws.length;i++) {
        encoded += String.fromCharCode(Math.floor((ws[i].charCodeAt())/256));
        encoded += String.fromCharCode(ws[i].charCodeAt()%256);
    }
    return encoded;
}
function translate_s2_to_ws(str) // for decoding '2' back to ws (_a_b_c[2 UNICODE BYTE] -> abc[UNI])
{
	var parsed = new String();
    for(var i = 0;i < str.length;i+=2) {
        if(i == str.length-1) {parsed += String.fromCharCode(i); break;}
        var code = (str[i].charCodeAt()*256)+(str[i+1].charCodeAt());
        parsed += String.fromCharCode(code);
    }
    return parsed;
}
function translate_s_to_bytes(str,bArr,startInd)
{
	for(var i = 0;i < str.length;i++) {
		bArr[startInd+i] = str[i].charCodeAt();
	}
}
function wsDecodeMsg(msg) // decode packet msg to data & auto decoding data with ENC
{
	if(msg instanceof Blob) { // binary message
		return {error:"BLOB"}
	}
	var encType = msg[0];
	var splitter = msg.indexOf('|');
	if(splitter == -1) return {error:"INVALID"};
	var opcode = msg.substring(1,splitter);
	var tid = msg.substring(splitter+1);
	var splitter2 = tid.indexOf('|')
	var dataS = tid.substring(splitter2+1);
	tid = tid.substring(0,splitter2);
	// decoding data
	if(encType == '2') dataS = translate_s2_to_ws(dataS);
	return {
		op:opcode ,
		data:dataS ,
		id:tid
	};
}
function wsDecodeBlobMsg(msg,callback) // reflow the message for blob loading & reading
{
    var reader = new FileReader();
    reader.addEventListener("loadend", function() {
    	var arr = new Uint8Array(reader.result);
        // convert arr to string 
        var str = new String();
        for(var i = 0;i < arr.length;i++) {
            str += String.fromCharCode(arr[i]);
        }
        console.log("DecodeBlob : "+str.substring(0,60));
        if(str.indexOf('|') == -1) { // error , invalid PalmOS packet
        	callback({error:"INVALID"});
        	return;
        }
        console.log(str);
        
        var packetObj = wsDecodeMsg(str);
        packetObj["dataArr"] = arr.subarray(str.indexOf('|',str.indexOf('|')+1)+1,arr.length);
       	callback(packetObj);
    });
    reader.readAsArrayBuffer(msg);
}