// This scripts fetches the tasks in CSI team sprint history (https://app.asana.com/0/412810785452798/list)
// And does some aggregations and pushes the metrics to CSI Dashboard spreadsheet (https://docs.google.com/spreadsheets/d/1M-uj6JpefsTmYjKfTjr_RRfsT6H7NEumKXsf4TyIyh8/edit#gid=569554026) to create sprint metrics
// To run this, you need to create a google script project, update access_token to a avlid API token, and have it trigger run() method daily in the corresponding Google project
// Disclaimer: This is not a clean maintenable code, rather it's a dashboard script that just works. 

function getData(date) {
  var access_token = "YOUR API TOKEN"
  if (typeof date === "undefined") {
    date = new Date();
  }
  url = 'https://app.asana.com/api/1.0/workspaces/15793206719/tasks/search?projects.any=412810785452798&sort_by=modified_at&opt_fields=memberships.section.name,id,created_at,modified_at,completed,assignee.name,completed_at,custom_fields,dependencies&limit=100&modified_at.before=' + date.toISOString() + "&access_token=" + access_token;
  Logger.log('created ---- ' + url)
  var response = UrlFetchApp.fetch(url);
  
  var json = response.getContentText();
  var data = JSON.parse(json);
 
  return data;
}


function writeToSheet(sheet, sheet2,sheet3, sheet4, sheet5) {
  var result = getData();
  var data = result.data;
  var tasks = [];
  var shouldContinue=true
  
  // Load the last 1000 tasks
  for (var count=0; count <10; count++) {
      for (var i=0; i < data.length; i++) {
        
         if (data[i].completed==false || (new Date(data[i].modified_at) < new Date(2019, 08, 22))) {
          continue;
         }
           tasks.push(data[i]);
      }
    
    Logger.log('Paging ---- ' + '---' + data[data.length-1].gid + '---' + data[data.length-1].modified_at)
    result=getData(new Date(data[data.length-1].modified_at))
    data = result.data
    if (data.length == 0) {
      break;
    }
  }
  
      // sort tasks
   for (var i=0; i < tasks.length-1; i++) {
     for (j=0; j<tasks.length-i-1; j++) {
       if (tasks[j+1].modified_at > tasks[j].modified_at) {
        var tmp = tasks[j]
        tasks[j]= tasks[j+1]
        tasks[j+1]=tmp
       }
     }
     
   }


  var buckets = []
  var sprints = []
  var quarters =[]
  var epics =[]
  var sprintsToAssignee = []
  var sprintsToEpics = []
  var headers = []
  
  headers.push(['id', 'Sprint', 'Created', 'Assignee', 'Points', 'Completed Date', 'Quarter', 'Epic', 'Day of Completion', 'isPresent'])
  sheet.getRange(sheet.getLastRow()+1, 1, 1, 10).setValues(headers)
  
  for (var i=0; i < tasks.length; i++) {
     var task = tasks[i]
      
     var created  = new Date(task.created_at)
     var completed  = new Date(task.completed_at)
     var points = -1
     var epic = 'N/A'
     var quarter= 'N/A'
     var sprint= 'N/A'
     var assignee = 'N/A'

     if (task.assignee!=null) {
       assignee = task.assignee.name
     }
     
     for (var j = 0; j < task.custom_fields.length; j++){
      if (task.custom_fields[j].gid == '1138873712680989' && task.custom_fields[j].enum_value != null){
        points = parseInt(task.custom_fields[j].enum_value.name)
      }
      if (task.custom_fields[j].gid == '1138863591702557' && task.custom_fields[j].enum_value != null){
        epic = task.custom_fields[j].enum_value.name 
      }      
      if (task.custom_fields[j].gid == '1138863591702579' && task.custom_fields[j].enum_value != null){
        quarter = task.custom_fields[j].enum_value.name 
      }
    }
    

    for (var section_counter=0; section_counter < task.memberships.length; section_counter++) {
      if (task.memberships[section_counter]!=null && task.memberships[section_counter].section!=null) {
          var section = task.memberships[section_counter].section.name
          Logger.log('Section ---- ' + '---' + section)
              if (section.toLowerCase().indexOf("sprint")!=-1 && section.indexOf("E2")!=-1 && section.indexOf(",")!=-1 && section.indexOf("-")!=-1) {
                sprint = section
                Logger.log('Sprint ---- ' + '---' + sprint)
              }
      }
    }
      
   
    if (sprint == 'N/A' || (points==-1 || epic=='N/A')) {
      continue;
    }
    
     var quarter_index = getBucket(quarters, quarter);
    if (quarter_index == -1) {
     quarters.push([quarter, 0]) 
     quarter_index= quarters.length -1 
    }
    quarters[quarter_index] = [quarter, quarters[quarter_index][1] + points]
    
     var epic_index = getBucket(epics, epic);
    if (epic_index == -1) {
     epics.push([epic, 0]) 
     epic_index= epics.length -1 
    }
    epics[epic_index] = [epic, epics[epic_index][1] + points]
    
    var sprint_index = getBucket(sprints, sprint);
    if (sprint_index == -1) {
     sprints.push([sprint, 0, 0, 0, 0]) 
     sprint_index= sprints.length -1 
    }
    
    // Upodate story point per epic per sprint
    var sprint_epic_index = getBucket(sprintsToEpics, sprint);
    if (sprint_epic_index == -1) {
     sprintsToEpics.push([sprint, []]) 
     sprint_epic_index= sprintsToEpics.length -1 
    }
    
    var epic_index = getBucket(sprintsToEpics[sprint_epic_index][1], epic);
    if (epic_index == -1) {
     var all_epics = sprintsToEpics[sprint_epic_index][1]
     all_epics.push([epic, 0])
     epic_index= all_epics.length -1 
    }
    
    sprintsToEpics[sprint_epic_index][1][epic_index] = [epic,  sprintsToEpics[sprint_epic_index][1][epic_index][1] + points]
    
    
    
    // Find Unique engineers
    var engineers = sprints[sprint_index][3]
    if (assignee != 'N/A') {
      var sprint_to_engineer_index = getBucket(sprintsToAssignee, sprint);
      if (sprint_to_engineer_index == -1) {
        sprintsToAssignee.push([sprint, []])
        sprint_to_engineer_index = sprintsToAssignee.length-1
      }
      var engineers_array = sprintsToAssignee[sprint_to_engineer_index][1]
      if (getBucket(engineers_array, assignee) == -1) {
        engineers_array.push([assignee])
        sprintsToAssignee[sprint_to_engineer_index][1] = engineers_array
        engineers = engineers+1
      }
    }
    
    
    sprints[sprint_index] = [sprint,  sprints[sprint_index][1] + 1, sprints[sprint_index][2] + points, engineers, Math.round((sprints[sprint_index][2] + points)/engineers)]
    
    buckets.push([task.gid, sprint, created, assignee, points, task.completed_at,  quarter, epic, completed.getDay(), 1])
  }
     
     sheet.getRange(sheet.getLastRow()+1, 1, buckets.length, 10).setValues(buckets);

  
  // Push Sprint Metrics
   headers = []
   headers.push(['Sprint', 'Completed Tasks', 'Story Points', 'Engineers', 'Average Per Engineer'])
   sheet2.getRange(sheet2.getLastRow()+1, 1, 1, 5).setValues(headers)
   sheet2.getRange(sheet2.getLastRow()+1, 1, sprints.length, 5).setValues(sprints);
  
   // Push Quarterint Metrics
   headers = []
   headers.push(['Quarter', 'Story Points'])
   sheet3.getRange(sheet3.getLastRow()+1, 1, 1, 2).setValues(headers)
   sheet3.getRange(sheet3.getLastRow()+1, 1, quarters.length, 2).setValues(quarters);
  
     // Push Epics Metrics
   headers = []
   headers.push(['Epic', 'Story Points'])
   sheet5.getRange(sheet5.getLastRow()+1, 1, 1, 2).setValues(headers)
   sheet5.getRange(sheet5.getLastRow()+1, 1, epics.length, 2).setValues(epics);
  
   headers = ['Sprint']
   for (var i=0; i < sprintsToEpics.length; i++) {
     for (j=0; j<sprintsToEpics[i][1].length; j++) {
       if (!findInArray(headers, sprintsToEpics[i][1][j][0])) {
         var epic_header = sprintsToEpics[i][1][j][0] + ''
        headers.push(epic_header) 
       }
       
     }
     
   }
  

  var sprint_epics_data=[]
  
     for (var i=0; i < sprintsToEpics.length; i++) {
       sprint_epics_data.push([sprintsToEpics[i][0]])
       for (var header_counter =1; header_counter<headers.length; header_counter++) {
         var found = false
         for (j=0; j<sprintsToEpics[i][1].length; j++) {
           var epic= sprintsToEpics[i][1][j][0]
           if (epic == headers[header_counter]) {
                  sprint_epics_data[sprint_epics_data.length-1].push(sprintsToEpics[i][1][j][1])
                  found = true
             }
          }
         if (found == false) {
           sprint_epics_data[sprint_epics_data.length-1].push(0)
         }
       }
       
     }
     
  
  
   sheet4.getRange(sheet4.getLastRow()+1, 1, 1, headers.length).setValues([headers])
  
   sheet4.getRange(sheet4.getLastRow()+1, 1, sprint_epics_data.length, headers.length).setValues(sprint_epics_data)
  


} 

function getBucket(buckets, data) {
 for (var i=0; i < buckets.length; i++) {
   if (buckets[i][0] == data) {
     return i
   }
 }
  return -1
  
}
     
function findInArray(array, data) {
 for (var i=0; i < array.length; i++) {
   if (array[i] == data) {
     return true
   }
 }
  return false
  
}


function diffDays(date1, date2){
  var diffTime = Math.abs(date2 - date1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}


function run() {
  var spreadsheetId = '1M-uj6JpefsTmYjKfTjr_RRfsT6H7NEumKXsf4TyIyh8';
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName("sprint-raw");
  sheet.clear();
  var sheet2 = SpreadsheetApp.openById(spreadsheetId).getSheetByName("sprint-aggregated");
  sheet2.clear();
   var sheet3 = SpreadsheetApp.openById(spreadsheetId).getSheetByName("sprint-quarters");
  sheet3.clear();
    var sheet4 = SpreadsheetApp.openById(spreadsheetId).getSheetByName("sprint-epics");
  sheet4.clear();
   var sheet5 = SpreadsheetApp.openById(spreadsheetId).getSheetByName("epics-aggregated");
  sheet5.clear();
  Logger.log('Start script')
  writeToSheet(sheet, sheet2, sheet3, sheet4, sheet5)  
}

